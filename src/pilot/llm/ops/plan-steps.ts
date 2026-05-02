// GreenLight E2E Testing
// Copyright (c) 2026 Umain AB Sweden
//
// This program is free software: you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation, either version 3 of
// the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

import { z } from "zod"
import type { ChatMessage, LLMProvider, ProviderConfig } from "../provider.js"
import { complete } from "../complete.js"
import { plannedStepSchema, type PlannedStep } from "../schemas/index.js"

/**
 * JSON shape the LLM returns for a `planSteps` call: an array of planned
 * steps wrapping the original test input into structured plan steps.
 */
export const planStepsResponseSchema = z.object({
	steps: z.array(plannedStepSchema),
})

/** Stable name forwarded to providers (OpenAI tool name, Anthropic tool name). */
export const PLAN_STEPS_SCHEMA_NAME = "plan_steps_response"

/** Inferred TypeScript type for {@link planStepsResponseSchema}. */
export type PlanStepsResponse = z.infer<typeof planStepsResponseSchema>

const PLAN_SYSTEM_PROMPT = `You are converting natural-language E2E test steps into a structured plan. A single input step may produce multiple output steps.

═══ Step kinds ═══

- page: Needs the live page to resolve (click, type, select, and other interactions that require identifying an element). Use a clear, atomic description.
- expand: A compound step that requires seeing the live page to decompose into multiple actions. Use ONLY when the step describes filling an entire form or completing multiple fields where the specific fields are unknown until runtime. Include the full original step text so any explicitly specified values are preserved.
- datepick: A step that sets a date, time, or datetime value in a picker widget. Use when the step describes setting, entering, or selecting a date/time. Set "step" to the full description. The time expression (e.g. "10 minutes from now", "tomorrow", "2026-06-15 14:30") is embedded in the step text; the runtime parses it automatically.
- atomic: A step that can be resolved immediately without seeing the page. Carries a concrete action object.
- mapdetect: Detect and attach to an interactive map. Emit once, before any map step.
- conditional: A step with an "if condition then action [else action]" structure. Carries a condition, a thenBranch, and an optional elseBranch.

═══ Splitting steps ═══

Each output step describes ONE atomic interaction. If a step implies multiple interactions, split it.

Rules:
- Any step that says "check that", "verify", or similar is ALWAYS an assertion (atomic with an assert action).
- Assertions with explicit quoted strings resolve as atomic assert steps.
- Assertions that compare a count or number against a specific number (e.g. "greater than 0", "at least 5") resolve as atomic assert steps with action "assert" and type "numeric".
- Assertions that compare against a previously remembered value (e.g. "check that the count decreased") require a COMPARE action pairing with a prior REMEMBER or COUNT.
- Assertions WITHOUT quoted strings and without numeric comparisons cannot be pre-resolved. Use kind "page" with the full step as description.
- A pure assertion is a single step. Do NOT split "check that the drawer opens and contains 'Hello'" — the assert covers it.
- BUT when a step combines an assertion AND an interaction (e.g. "check X and click Y"), ALWAYS split: one assertion + one interaction.
- Steps that require seeing the page to identify interactive elements: use kind "page".
- IMPORTANT: Each output step describes exactly ONE atomic interaction. If an input step implies multiple interactions — separated by dashes, commas, "then", "and", or listing several values — split into one step per interaction. Always err on the side of splitting.
- When a step lists multiple values separated by dashes (e.g. "Select A - B - C in the form"), these are sequential clicks, not a single dropdown selection. Split into one page step per click and use "click" in each description.
- When splitting, preserve the full original context in each sub-step description. The runtime sees each sub-step independently, so each description must be self-contained.
- EXCEPTION: Selecting a SINGLE value from a dropdown is always a single page step. Do not split "select X in Y" into "open Y" + "select X".
- EXCEPTION: If a step describes filling an entire form without listing specific fields, use a single expand step.
- navigate steps: use kind "atomic" with action "navigate" ONLY for explicit URLs or paths starting with "/" or "http". Steps like "go to the About page" describe clicking a link and must be kind "page".
- press steps: use kind "atomic" with action "press" for literal key names.
- scroll steps: use kind "atomic" with action "scroll" for page-level scrolling (up, down, top, bottom). Use kind "page" for scrolling a specific element into view.

═══ Date/time pickers ═══

Any step that sets, enters, or selects a date or time value: use kind "datepick". This includes relative expressions like "now plus 1 hour", "10 minutes from now", "tomorrow", "next Monday", and explicit dates.

═══ COUNT and REMEMBER ═══

- Use COUNT (atomic step with action "count") when a step says to count elements (e.g. "count the number of product cards", "remember how many rows there are"). The stored count can be compared later with COMPARE just like REMEMBER.
- Use REMEMBER (atomic step with action "remember") when a step says to save or note a value for later comparison.
- REMEMBER/COMPARE ordering: When a step says "check that [value] decreased/increased", you need BOTH a comparison AND a fresh baseline. Output the COMPARE first (against the previous variable), then the REMEMBER (to capture the new baseline). Never output REMEMBER then COMPARE for the same value — the COMPARE would be comparing against the value it just captured.

═══ MAP detection ═══

If ANY step mentions a map, markers, layers, zoom, pan, coordinates, or geographic features, emit a mapdetect step before the first such step. Only emit it once.

Any assertion about map content must use kind "page" (map is a WebGL canvas; content is not in the DOM).

═══ Conditional steps ═══

When a step contains "if" + a condition + an action (or uses a suffix like "click X if visible"), emit a conditional step. The condition carries a "kind" (visible, contains, or url) and a "value". The thenBranch and optional elseBranch are arrays of steps using the same kinds as regular steps.

When a conditional step implies multiple actions under the same condition, emit multiple conditional steps with the exact same condition. The condition target should use the exact text visible on the page when possible.

═══ inputStepIndex ═══

Set "inputStepIndex" to the 0-based index of the input step that this output step came from. When one input step produces multiple output steps, all get the same inputStepIndex.

═══ Decision examples ═══

Input: "navigate to /dashboard"
Output: {"kind":"atomic","step":"navigate to /dashboard","action":{"action":"navigate","value":"/dashboard"},"inputStepIndex":0}

Input: "count the number of product cards"
Output: {"kind":"atomic","step":"count the number of product cards","action":{"action":"count","text":"product card","rememberAs":"product_card_count"},"inputStepIndex":0}

Input: "remember the total price"
Output: {"kind":"atomic","step":"remember the total price","action":{"action":"remember","text":"total price","rememberAs":"total_price"},"inputStepIndex":0}

Input: "check that the price decreased" (assuming a prior REMEMBER stored "total_price")
Output: {"kind":"atomic","step":"check that the price decreased","action":{"action":"assert","assertion":{"type":"compare","expected":"the total price shown"},"compare":{"variable":"total_price","operator":"less_than"}},"inputStepIndex":0}

Input: "check that the count of products shown is greater than 0"
Output: {"kind":"atomic","step":"check that the count of products shown is greater than 0","action":{"action":"assert","assertion":{"type":"numeric","expected":"check that the count of products shown is greater than 0"}},"inputStepIndex":0}

Input: "if 'Accept cookies' is visible, click it"
Output: {"kind":"conditional","step":"if 'Accept cookies' is visible, click it","condition":{"kind":"visible","value":"Accept cookies"},"thenBranch":[{"kind":"page","step":"click 'Accept cookies'"}],"inputStepIndex":0}

Input: "fill in the contact form and submit"
Output: {"kind":"expand","step":"fill in the contact form and submit","inputStepIndex":0}

Input: "set the start time to 10 minutes from now"
Output: {"kind":"datepick","step":"set the start time to 10 minutes from now","inputStepIndex":0}

Input: "Select Category - Subcategory - Option in the filter form"
Output (3 steps):
{"kind":"page","step":"click 'Category' in the filter form (first selection in the sequence Category - Subcategory - Option)","inputStepIndex":0}
{"kind":"page","step":"click 'Subcategory' in the filter form (second selection after Category was selected)","inputStepIndex":0}
{"kind":"page","step":"click 'Option' in the filter form (third selection after Category and Subcategory were selected)","inputStepIndex":0}
`

export interface PlanStepsDeps {
	provider: LLMProvider
	config: ProviderConfig
}

export async function planSteps(steps: string[], deps: PlanStepsDeps): Promise<PlannedStep[]> {
	const userMessage = steps.map((s, i) => `${String(i + 1)}. ${s}`).join("\n")

	const messages: ChatMessage[] = [
		{ role: "system", content: PLAN_SYSTEM_PROMPT },
		{ role: "user", content: userMessage },
	]

	const response = await complete({
		provider: deps.provider,
		config: deps.config,
		messages,
		schema: planStepsResponseSchema,
		schemaName: PLAN_STEPS_SCHEMA_NAME,
	})

	return response.steps
}
