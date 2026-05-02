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

/**
 * Barrel for the domain schemas of the LLM subsystem.
 *
 * Domain schemas (Action, PlannedStep, Condition, Compare, Assertion) live
 * in their own files because each represents a reusable piece of the
 * LLM's vocabulary that other schemas compose. Per-op response envelopes
 * (the actual JSON shape each call site returns) live next to their
 * consuming op in `src/pilot/llm/ops/*.ts`, since each envelope is only
 * used by its own op.
 */

export { actionSchema, ACTION_SCHEMA_NAME, type Action } from "./action.js"
export { plannedStepSchema, PLANNED_STEP_SCHEMA_NAME, type PlannedStep } from "./planned-step.js"
export { conditionSchema, type Condition } from "./condition.js"
export { compareSchema, compareOperatorSchema, type Compare, type CompareOperator } from "./compare.js"
export { assertionSchema, assertionTypeSchema, type Assertion, type AssertionType } from "./assertion.js"
