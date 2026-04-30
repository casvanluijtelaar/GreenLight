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
 * Discriminated union over `kind`. Each variant carries only the fields
 * meaningful for that kind. Replaces the flat-flags PlannedStep in
 * src/pilot/response-parser.ts.
 *
 * Variant list comes from parsePlanAction in response-parser.ts.
 */

const atomicStep = z.object({
	kind: z.literal("atomic"),
	step: z.string(),
	action: actionSchema,
	inputStepIndex: z.number().int().optional(),
})

const expandStep = z.object({
	kind: z.literal("expand"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

const datepickStep = z.object({
	kind: z.literal("datepick"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

const mapDetectStep = z.object({
	kind: z.literal("mapdetect"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

const pageStep = z.object({
	kind: z.literal("page"),
	step: z.string(),
	inputStepIndex: z.number().int().optional(),
})

// Recursive: thenBranch and elseBranch are arrays of PlannedStep.
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

export const plannedStepSchema: z.ZodType<PlannedStepShape> = z.lazy(() =>
	z.discriminatedUnion("kind", [
		atomicStep,
		expandStep,
		datepickStep,
		mapDetectStep,
		pageStep,
		z.object({
			kind: z.literal("conditional"),
			step: z.string(),
			condition: conditionSchema,
			thenBranch: z.array(plannedStepSchema),
			elseBranch: z.array(plannedStepSchema).optional(),
			inputStepIndex: z.number().int().optional(),
		}),
	]),
)

export type PlannedStep = z.infer<typeof plannedStepSchema>
export const PLANNED_STEP_SCHEMA_NAME = "planned_step"
