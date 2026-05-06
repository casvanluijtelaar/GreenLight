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
import { actionSchema } from "./action.js"
import { conditionSchema } from "./condition.js"

/**
 * A single step in a generated plan that already has a fully-resolved Action
 * attached. Most steps fall into this kind: the planner has decided which
 * action variant to emit and filled in its targeting fields.
 */
const atomicStep = z.object({
	kind: z.literal("atomic"),
	step: z.string().describe("Human-readable description of the step (the original test text or the planner's rephrasing)."),
	action: actionSchema,
	inputStepIndex: z.number().int().nonnegative().describe("Zero-based index of the original input step this planned step came from. When one input produces multiple outputs they share the same index.").optional(),
}).describe("A step with a fully-resolved action attached. Use this for any step the planner can decide without seeing the live page (navigates with explicit URLs, presses, scrolls, assertions with quoted strings or numeric comparisons, remember / count).")

/**
 * A compound step (typically "fill in the form") that needs runtime expansion
 * against the live page state. The runtime calls `expandStep` to produce a
 * sequence of atomic sub-steps based on the actual fields on the page.
 */
const expandStep = z.object({
	kind: z.literal("expand"),
	step: z.string().describe("Full original step text — values mentioned in it must be preserved so the runtime expansion can use them."),
	inputStepIndex: z.number().int().nonnegative().optional(),
}).describe("A compound step (e.g. 'fill in the contact form and submit') that needs the live page to decompose into atomic actions. Use ONLY when the specific fields are unknown until runtime.")

/**
 * A date/time picker step. The runtime detects whether the picker is a
 * native HTML5 input, a MUI sectioned spinbutton, or a calendar popup, and
 * fills in `step` accordingly. Date computation is always fresh, so cached
 * runs get current timestamps rather than stale ones.
 */
const datepickStep = z.object({
	kind: z.literal("datepick"),
	step: z.string().describe("Full step text including the time expression (e.g. '10 minutes from now', 'tomorrow', '2026-06-15 14:30'). The runtime parses the expression."),
	inputStepIndex: z.number().int().nonnegative().optional(),
}).describe("A step that sets a date or time value in a picker widget (native input, MUI sectioned spinbutton, or calendar popup). The runtime auto-detects the picker type.")

/**
 * Detect a map adapter (MapLibre, Leaflet, Mapbox, etc.) on the page and
 * attach it to the run. Subsequent `assert` actions with `map_state`
 * assertions read state from this adapter.
 */
const mapDetectStep = z.object({
	kind: z.literal("mapdetect"),
	step: z.string().describe("Short description like 'detect map'."),
	inputStepIndex: z.number().int().nonnegative().optional(),
}).describe("Detect and attach to a map adapter (MapLibre, Leaflet, Mapbox). Emit ONCE, before any step that interacts with or asserts on the map.")

/**
 * An informational PAGE marker step. Records intent in the run report but
 * does not execute. Useful as a no-op separator or annotation.
 */
const pageStep = z.object({
	kind: z.literal("page"),
	step: z.string().describe("Self-contained description of the single interaction (preserve any context from the original input step)."),
	inputStepIndex: z.number().int().nonnegative().optional(),
}).describe("A step that needs the live page state to decide which element to target. Use for clicks, types, selects, and assertions without quoted strings or numeric comparisons.")

// Recursive type: thenBranch and elseBranch each contain arrays of PlannedStep,
// which can themselves be conditionals.
type PlannedStepShape =
	| z.infer<typeof atomicStep>
	| z.infer<typeof expandStep>
	| z.infer<typeof datepickStep>
	| z.infer<typeof mapDetectStep>
	| z.infer<typeof pageStep>
	| {
			kind: "conditional"
			step: string
			condition: z.infer<typeof conditionSchema>
			thenBranch: PlannedStepShape[]
			elseBranch?: PlannedStepShape[]
			inputStepIndex?: number
	  }

/**
 * The shape of a step in a generated plan, expressed as a Zod discriminated
 * union over the literal `kind` field.
 *
 * Kinds at a glance:
 *
 * - `atomic`: a fully-resolved action (carries an Action variant).
 * - `expand`: a compound step that needs runtime expansion to produce sub-steps.
 * - `datepick`: a date/time picker step.
 * - `mapdetect`: detect-and-attach a map adapter.
 * - `page`: an informational marker; recorded but not executed.
 * - `conditional`: an if/then/else step with a condition and one or two branches.
 *   This is the only recursive variant: each branch is itself an array of
 *   PlannedSteps, which may include further conditionals.
 *
 * Defined via `z.lazy` because the conditional variant references the union
 * type itself in its `thenBranch` / `elseBranch` arrays.
 */
export const plannedStepSchema: z.ZodType<PlannedStepShape> = z.lazy(() =>
	z.discriminatedUnion("kind", [
		atomicStep,
		expandStep,
		datepickStep,
		mapDetectStep,
		pageStep,
		z.object({
			kind: z.literal("conditional"),
			step: z.string().describe("Human-readable description of the conditional (e.g. 'if cookie banner is visible, accept it')."),
			condition: conditionSchema,
			thenBranch: z.array(plannedStepSchema).describe("Steps to execute when the condition is met."),
			elseBranch: z.array(plannedStepSchema).describe("Steps to execute when the condition is NOT met. Omit when there is no else branch.").optional(),
			inputStepIndex: z.number().int().nonnegative().optional(),
		}).describe("An if/then/else step. Each branch is itself an array of PlannedSteps and may contain further conditionals."),
	]),
)

/** Inferred TypeScript type for {@link plannedStepSchema}. */
export type PlannedStep = z.infer<typeof plannedStepSchema>

/**
 * Stable identifier providers use to refer to this schema (OpenAI tool name,
 * Anthropic tool name). Snake_case to match common API conventions.
 */
export const PLANNED_STEP_SCHEMA_NAME = "planned_step"

