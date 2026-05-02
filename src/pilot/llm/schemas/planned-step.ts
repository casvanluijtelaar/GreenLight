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
	/** Human-readable description of the step (the original test step text or the planner's rephrasing). */
	step: z.string(),
	/** The fully-resolved action to execute. See {@link actionSchema}. */
	action: actionSchema,
	/** Index of the original test input step this planned step came from (zero-based). */
	inputStepIndex: z.number().int().optional(),
})

/**
 * A compound step (typically "fill in the form") that needs runtime expansion
 * against the live page state. The runtime calls `expandStep` to produce a
 * sequence of atomic sub-steps based on the actual fields on the page.
 */
const expandStep = z.object({
	kind: z.literal("expand"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

/**
 * A date/time picker step. The runtime detects whether the picker is a
 * native HTML5 input, a MUI sectioned spinbutton, or a calendar popup, and
 * fills in `step` accordingly. Date computation is always fresh, so cached
 * runs get current timestamps rather than stale ones.
 */
const datepickStep = z.object({
	kind: z.literal("datepick"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

/**
 * Detect a map adapter (MapLibre, Leaflet, Mapbox, etc.) on the page and
 * attach it to the run. Subsequent `assert` actions with `map_state`
 * assertions read state from this adapter.
 */
const mapDetectStep = z.object({
	kind: z.literal("mapdetect"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

/**
 * An informational PAGE marker step. Records intent in the run report but
 * does not execute. Useful as a no-op separator or annotation.
 */
const pageStep = z.object({
	kind: z.literal("page"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

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
			/** Human-readable description of the conditional (e.g. "if cookie banner is visible"). */
			step: z.string(),
			/** Condition to evaluate at runtime. See {@link conditionSchema}. */
			condition: conditionSchema,
			/** Steps to execute when the condition is met. */
			thenBranch: z.array(plannedStepSchema),
			/** Optional steps to execute when the condition is not met. */
			elseBranch: z.array(plannedStepSchema).optional(),
			inputStepIndex: z.number().int().optional(),
		}),
	]),
)

/** Inferred TypeScript type for {@link plannedStepSchema}. */
export type PlannedStep = z.infer<typeof plannedStepSchema>

/**
 * Stable identifier providers use to refer to this schema (OpenAI tool name,
 * Anthropic tool name). Snake_case to match common API conventions.
 */
export const PLANNED_STEP_SCHEMA_NAME = "planned_step"
