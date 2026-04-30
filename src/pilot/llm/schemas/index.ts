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
import { plannedStepSchema } from "./planned-step.js"

export { actionSchema, ACTION_SCHEMA_NAME, type Action } from "./action.js"
export { plannedStepSchema, PLANNED_STEP_SCHEMA_NAME, type PlannedStep } from "./planned-step.js"
export { conditionSchema, type Condition } from "./condition.js"
export { compareSchema, compareOperatorSchema, type Compare, type CompareOperator } from "./compare.js"
export { assertionSchema, assertionTypeSchema, type Assertion, type AssertionType } from "./assertion.js"

// Per-op response envelopes. Each wraps the core schema in the actual JSON
// shape returned by the LLM for that call site.

export const resolveStepResponseSchema = z.object({
	thinking: z.string().optional(),
	action: actionSchema,
})
export const RESOLVE_STEP_SCHEMA_NAME = "resolve_step_response"
export type ResolveStepResponse = z.infer<typeof resolveStepResponseSchema>

export const planStepsResponseSchema = z.object({
	steps: z.array(plannedStepSchema),
})
export const PLAN_STEPS_SCHEMA_NAME = "plan_steps_response"
export type PlanStepsResponse = z.infer<typeof planStepsResponseSchema>

export const expandStepResponseSchema = z.object({
	steps: z.array(plannedStepSchema),
})
export const EXPAND_STEP_SCHEMA_NAME = "expand_step_response"
export type ExpandStepResponse = z.infer<typeof expandStepResponseSchema>

export const evaluateConditionResponseSchema = z.object({
	result: z.boolean(),
	reason: z.string().optional(),
})
export const EVALUATE_CONDITION_SCHEMA_NAME = "evaluate_condition_response"
export type EvaluateConditionResponse = z.infer<typeof evaluateConditionResponseSchema>
