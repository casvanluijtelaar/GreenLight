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
 * Comparison operator for `compare`-style assertions. Used when an assertion
 * needs to relate two values numerically or by equality rather than verifying
 * page state directly. The runtime interpreter lives in
 * `src/pilot/assertions.ts::executeCompareAssertion`.
 */
export const compareOperatorSchema = z.enum([
	"less_than",
	"greater_than",
	"equal",
	"not_equal",
	"less_or_equal",
	"greater_or_equal",
]).describe(
	"Comparison operator. Numeric semantics where both sides parse as numbers; otherwise string equality / inequality for 'equal' / 'not_equal'.",
)

/** Inferred TypeScript type for {@link compareOperatorSchema}. */
export type CompareOperator = z.infer<typeof compareOperatorSchema>

/**
 * Comparison clause attached to an `assert` action. Specifies how to compare
 * the page's current value against either a remembered variable or a literal:
 *
 * - `variable: "<name>"` and no `literal`: read the current page value and
 *   compare it against the value stored under `<name>` by an earlier
 *   `remember` / `count` action.
 * - `variable: "_"` and `literal: "<x>"`: read the current page value and
 *   compare it against the literal `<x>` directly (no variable lookup).
 * - `variable: "<name>"` and `literal: "<x>"`: compare the previously
 *   remembered value against the literal (no fresh page read).
 */
export const compareSchema = z.object({
	variable: z.string()
		.regex(/^(_|[a-z][a-z0-9_]*)$/)
		.describe("Either the snake_case name of a variable previously stored by 'remember' or 'count', OR the sentinel '_' meaning 'no variable; use literal only'."),
	operator: compareOperatorSchema,
	literal: z.string().describe(
		"Literal value to compare against (as a string; the runtime parses numerics). When 'variable' is '_' this is required and the runtime reads the page value and compares it to this literal. When 'variable' names a stored value this is optional; if set, the comparison is variable-vs-literal (no fresh page read).",
	).optional(),
}).describe("Comparison clause attached to an 'assert' action with type 'compare' or 'contains_remembered'.")

/** Inferred TypeScript type for {@link compareSchema}. */
export type Compare = z.infer<typeof compareSchema>
