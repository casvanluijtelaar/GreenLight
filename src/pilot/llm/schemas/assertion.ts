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
 * Set of assertion types the runtime knows how to evaluate.
 *
 * The enum is the authoritative list of cases handled by
 * `src/pilot/assertions.ts::buildAssertionCheck` (and `executeMapAssertion`
 * for the `map_state` case). Adding a value here without a corresponding
 * runtime branch (or removing one that the runtime still expects) produces
 * a `ZodError` that no consumer can fix; keep the two in sync.
 *
 * Categories at a glance:
 *
 * - **Text content**: `contains_text`, `not_contains_text`, `contains_remembered`.
 * - **URL**: `url_contains`.
 * - **Element presence**: `element_visible`, `element_not_visible`,
 *   `element_exists`, `link_exists`, `field_exists`.
 * - **Element viewport**: `element_in_viewport`, `element_not_in_viewport`.
 * - **Element interactivity**: `element_disabled`, `element_enabled`.
 * - **Map**: `map_state` (the runtime parses sub-fields out of `expected`).
 * - **Compare**: `compare` (paired with the action's `compare` clause; the
 *   runtime delegates to `executeCompareAssertion`).
 */
export const assertionTypeSchema = z.enum([
	"contains_text",
	"not_contains_text",
	"url_contains",
	"element_visible",
	"element_exists",
	"element_not_visible",
	"link_exists",
	"field_exists",
	"element_in_viewport",
	"element_not_in_viewport",
	"element_disabled",
	"element_enabled",
	"contains_remembered",
	"map_state",
	"compare",
]).describe(
	"Which check to perform. Each value has specific requirements on the surrounding 'assert' action:\n" +
	"- contains_text: page body contains 'expected' as a literal substring (use whenever a step quotes a fixed string).\n" +
	"- not_contains_text: page body does NOT contain 'expected' as a literal substring.\n" +
	"- contains_remembered: page body contains a previously remembered variable's value. REQUIRES action.compare.variable to name the remembered variable. NEVER use for literal substrings — that is contains_text.\n" +
	"- url_contains: current page URL contains 'expected' as a literal substring.\n" +
	"- element_visible / element_not_visible: an element matching 'expected' is (or is not) visible on the page.\n" +
	"- element_exists: an element matching 'expected' exists in the DOM.\n" +
	"- link_exists: an <a> element with href matching 'expected' exists.\n" +
	"- field_exists: a form field with label/placeholder/aria-label matching 'expected' exists.\n" +
	"- element_in_viewport / element_not_in_viewport: an element matching 'expected' is (or is not) within the visible viewport (use after scroll actions to verify scroll target).\n" +
	"- element_enabled / element_disabled: an interactive element matching 'expected' is enabled or disabled.\n" +
	"- map_state: a property of the rendered map (zoom, center, layer visibility). Used with maps; 'expected' is a key=value condition like 'zoom>=10' or 'layer roads visible'.\n" +
	"- compare: numeric comparison via the action's compare clause. REQUIRES action.compare to be set.",
)

/**
 * Payload of an `assert` action. Always carries a `type` (which runtime check
 * to perform) and `expected` (a free-form string interpreted per `type`).
 */
export const assertionSchema = z.object({
	type: assertionTypeSchema,
	expected: z.string().describe(
		"What the assertion expects. Interpretation depends on 'type': literal substring for contains_text / not_contains_text / url_contains; element description for element_* / link_exists / field_exists; key=value condition for map_state; short human-readable hint for compare and contains_remembered (the actual value comes from the compare clause / variable store).",
	),
}).describe("Payload of an 'assert' action. Combine with 'compare' on the action when type is 'compare' or 'contains_remembered'.")

/** Inferred TypeScript type for {@link assertionSchema}. */
export type Assertion = z.infer<typeof assertionSchema>
/** Inferred TypeScript type for {@link assertionTypeSchema}. */
export type AssertionType = z.infer<typeof assertionTypeSchema>
