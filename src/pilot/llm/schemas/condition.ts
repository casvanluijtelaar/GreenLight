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

/**
 * Condition for conditional planned steps. The planner emits one of these
 * when wrapping atomic actions in if/then/else logic, mirroring the legacy
 * `IF_VISIBLE` / `IF_CONTAINS` / `IF_URL` DSL keywords.
 *
 * The runtime evaluator in `src/pilot/conditions.ts::evaluateCondition`
 * switches on `type` to decide how to verify the condition against the live
 * page state.
 */
export const conditionSchema = z.object({
	/**
	 * Which kind of check to perform:
	 * - `visible`: an element matching `target` is visibly rendered on the page.
	 * - `contains`: the page text contains `target` as a substring.
	 * - `url`: the current URL contains `target` as a substring.
	 */
	type: z.enum(["visible", "contains", "url"]),
	/**
	 * What to look for. The interpretation depends on `type`:
	 * a free-form description of the element for `visible`, or a substring
	 * for `contains` / `url`.
	 */
	target: z.string(),
})

/** A condition the runtime evaluates against the live page state. */
export type Condition = z.infer<typeof conditionSchema>
