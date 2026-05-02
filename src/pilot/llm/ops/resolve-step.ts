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
import { LLMApiError } from "../provider.js"
import { complete } from "../complete.js"
import { actionSchema, type Action } from "../schemas/index.js"
import { pruneHistory } from "../history.js"
import { buildUserMessage, buildCompactMessage } from "../../message-builder.js"
import { formatA11yTree } from "../../a11y-parser.js"
import type { PageState } from "../../../reporter/types.js"
import { globals } from "../../../globals.js"

/**
 * JSON shape the LLM returns for a `resolveStep` call: a single Action plus
 * an optional `thinking` field for the model's reasoning.
 */
export const resolveStepResponseSchema = z.object({
	thinking: z.string().optional(),
	action: actionSchema,
})

/** Stable name forwarded to providers (OpenAI tool name, Anthropic tool name). */
export const RESOLVE_STEP_SCHEMA_NAME = "resolve_step_response"

/** Inferred TypeScript type for {@link resolveStepResponseSchema}. */
export type ResolveStepResponse = z.infer<typeof resolveStepResponseSchema>

export const SYSTEM_PROMPT = `You are The Pilot, an AI agent that executes end-to-end tests in a web browser.

You receive a plain-English test step and the current page state.
Your job is to determine the SINGLE browser action needed to execute the step.
Return a JSON object matching the response schema. No extra explanation.

═══ Page state ═══

The page state may be provided in different levels of detail:
- Full state: complete accessibility tree with enrichment data (first step and after navigation).
- Tree diff: only the added/removed lines from the accessibility tree (when a small part of the page changed, e.g. a form wizard step).
  Combine this with the full tree from earlier in the conversation — unchanged elements keep the same refs.
- Unchanged: the page is identical to the previous step.

Element refs (e1, e2, ...) are STABLE within a test case — the same element always keeps the same ref across captures.
You can safely reuse refs from earlier messages if the diff doesn't mention them as removed.

Each element in the tree may include enrichment properties indented below it:
- "text": the visible text content (only shown when different from the element's a11y name)
- "placeholder": the placeholder attribute (for inputs)
- "value": the current input value or selected option

═══ Element targeting ═══

- ALWAYS use "ref" to target elements. Use the enrichment properties (text, placeholder, value) to match the step description to the right element.
- Use "text" ONLY as a last resort when the element is genuinely not in the accessibility tree. This is rare.
- Never guess a ref. If you cannot confidently identify the element in the tree, use "text".
- Use enrichment data to match fuzzy descriptions: if the step says "password field", match it to a textbox with placeholder "Enter visitor password".
- When the step contains a word or phrase in quotes (e.g. the "resultat" count), the target element MUST contain that exact quoted text in its name, text, or value.

═══ Interaction actions ═══

- click: Click an element. Use "ref" when available; fall back to "text" only when the element is not in the tree.
- check / uncheck: Toggle a checkbox. Use instead of click for checkboxes.
- type: Type text into an input. When the step says "a string" or "some test data", generate realistic values that match the field name. When the step says "random string" or "random number", generate a fully random value.
- clear: Clear a field, filter, selection, or tag input. Use for any step that says "clear", "reset", or "remove" a field or filter. The runtime detects the element type and finds the appropriate clear mechanism automatically.
- upload: Upload file(s) to a file input. Use "testid" (data-testid value) when the step mentions one — it is the most reliable way to target hidden file inputs. Otherwise use "ref" or "text". For multiple files, separate paths with a comma. Use this for steps that say "upload", "attach", or "select a file".
- For date/time inputs: compute the actual date/time value from the current time provided in the page state when the step uses relative expressions like "now plus 1 hour" or "tomorrow". Format dates as the input expects (check placeholder or input type).
- select: Select a dropdown option. The "option" field holds the option label.
- autocomplete: Type into an autocomplete field, wait for suggestions, pick one. The "option" field selects a specific suggestion; defaults to first if omitted.
- scroll: Page scroll uses "value" (up, down, top, bottom). To scroll a specific element into view, use "ref" or "text" with no "value".
- navigate: Go to a URL. The "value" field holds the URL or path.
- press: Press a key. The "value" field holds the key name (e.g. "Enter", "Tab", "Escape").
- wait: Wait for a condition. The "value" field describes what to wait for.
- remember: Capture a value from the page for later comparison. Target the most specific element containing the value — not a parent or wrapper. Use "rememberAs" for the variable name.
- count: Count elements matching a description. Use "text" with a value that matches ALL target elements and ONLY those elements. Prefer a common role or accessible name shared by all instances. Use "rememberAs" for the variable name.

═══ Assertion actions ═══

Any step starting with "check that" is ALWAYS an assertion — never return an interaction.

Assertion type selection:
- contains_text / not_contains_text: check page body text.
- url_contains: check the current URL.
- element_visible / element_not_visible: check element visibility.
- element_disabled / element_enabled: check if a button is disabled or enabled.
- element_in_viewport / element_not_in_viewport: check if an element is within the visible viewport. Use after scroll actions to verify an element was scrolled into (or out of) view.
- element_exists / link_exists / field_exists: check element presence.
- compare: numeric comparison against a remembered variable or a literal number. Against a remembered variable: set "variable" to the variable name. Against a literal number: set "literal" to the number and "variable" to "_".
- map_state: assert a condition about the map (see Map section below).

═══ Map ═══

When a map is detected, the page state includes a "Map state" section with center, zoom, bearing, pitch, bounds, and layers.

For ANY step about the map's position, zoom, area, or content, use assertion type "map_state" — NEVER "contains_text".
The map is a WebGL canvas; its content does NOT appear in the DOM.

map_state "expected" examples:
- "map shows Stockholm"
- "zoom level is at least 10"
- "layer hospitals is visible"

═══ Decision examples ═══

Clicking a button by ref (ref available in tree):
{"action":{"action":"click","ref":"e5"}}

Clicking when element is not in the tree (text fallback):
{"action":{"action":"click","text":"About us"}}

Typing realistic test data into an email field:
{"action":{"action":"type","ref":"e3","value":"jane@example.com"}}

Autocomplete with a specific suggestion:
{"action":{"action":"autocomplete","ref":"e4","value":"foo","option":"foobar inc"}}

Uploading via data-testid (hidden file input pattern):
{"action":{"action":"upload","testid":"og-file-input","value":"fixtures/og_image.png"}}

Remembering a value (target the specific element, not a wrapper):
{"action":{"action":"remember","ref":"e15","rememberAs":"product_count"}}

Counting elements (text must match ALL and ONLY the target elements):
{"action":{"action":"count","text":"Add to Cart","rememberAs":"cart_buttons"}}

Compare against a remembered variable:
{"action":{"action":"assert","assertion":{"type":"compare","expected":"product count"},"ref":"e15","compare":{"variable":"product_count","operator":"less_than"}}}

Compare against a literal number (variable set to "_"):
{"action":{"action":"assert","assertion":{"type":"compare","expected":"product count"},"ref":"e15","compare":{"variable":"_","operator":"greater_than","literal":0}}}

Map assertion:
{"action":{"action":"assert","assertion":{"type":"map_state","expected":"map shows Stockholm"}}}
`

export interface ResolveStepDeps {
	provider: LLMProvider
	config: ProviderConfig
	history: ChatMessage[]
	prevPageState: PageState | null
	prevFormattedTree: string
	cache: Map<string, Action>
}

export interface ResolveStepResult {
	action: Action
	newHistory: ChatMessage[]
	newPrevPageState: PageState
	newPrevFormattedTree: string
}

/**
 * Resolve a single step using the page state and accessibility tree.
 * Mirrors the previous createLLMClient::resolveStep behaviour: cache check,
 * compact-vs-full message build, history pruning, context-length recovery.
 */
export async function resolveStep(
	step: string,
	pageState: PageState,
	deps: ResolveStepDeps,
): Promise<ResolveStepResult> {
	// 1. Cache check.
	const cacheKey = `${step}\0${pageState.url}`
	const cached = deps.cache.get(cacheKey)
	if (cached) {
		return {
			action: cached,
			newHistory: deps.history,
			newPrevPageState: pageState,
			newPrevFormattedTree: deps.prevFormattedTree,
		}
	}

	// 2. Build the user message (compact when possible).
	let userMessage: string
	let compactMode = "full"
	if (deps.prevPageState && deps.history.length > 0) {
		const compact = buildCompactMessage(step, pageState, deps.prevPageState, deps.prevFormattedTree)
		if (compact) {
			userMessage = compact.message
			compactMode = compact.mode
		} else {
			userMessage = buildUserMessage(step, pageState)
		}
	} else {
		userMessage = buildUserMessage(step, pageState)
	}

	if (globals.debug) {
		console.log(`      [resolve] Mode: ${compactMode} (${String(userMessage.length)} chars)`)
		console.log(`      [resolve] LLM input:\n${userMessage}`)
	}

	// 3. Prune history to fit token budget.
	const { history: historySlice } = pruneHistory({ systemPrompt: SYSTEM_PROMPT, userMessage, history: deps.history })
	if (historySlice.length !== deps.history.length && globals.debug) {
		console.log(`      [resolve] Pruned history: ${String(deps.history.length)} -> ${String(historySlice.length)} messages`)
	}

	// 4. Call the LLM with the structured response schema.
	let response: { thinking?: string; action: Action }
	try {
		response = await complete({
			provider: deps.provider,
			config: deps.config,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				...historySlice,
				{ role: "user", content: userMessage },
			],
			schema: resolveStepResponseSchema,
			schemaName: RESOLVE_STEP_SCHEMA_NAME,
		})
	} catch (err) {
		// Context-length recovery: clear history and retry with a fresh full message.
		if (err instanceof LLMApiError && /context.length|token/i.test(err.message)) {
			console.log(`      Context length exceeded, clearing history and retrying`)
			const freshMessage = buildUserMessage(step, pageState)
			response = await complete({
				provider: deps.provider,
				config: deps.config,
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					{ role: "user", content: freshMessage },
				],
				schema: resolveStepResponseSchema,
				schemaName: RESOLVE_STEP_SCHEMA_NAME,
			})
			deps.cache.set(cacheKey, response.action)
			return {
				action: response.action,
				newHistory: [
					{ role: "user", content: freshMessage },
					{ role: "assistant", content: JSON.stringify(response) },
				],
				newPrevPageState: pageState,
				newPrevFormattedTree: formatA11yTree(pageState.a11yTree),
			}
		}
		throw err
	}

	// 5. Cache and return.
	deps.cache.set(cacheKey, response.action)
	return {
		action: response.action,
		newHistory: [
			...deps.history,
			{ role: "user", content: userMessage },
			{ role: "assistant", content: JSON.stringify(response) },
		],
		newPrevPageState: pageState,
		newPrevFormattedTree: formatA11yTree(pageState.a11yTree),
	}
}
