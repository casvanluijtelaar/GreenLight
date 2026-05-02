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
])

/**
 * Payload of an `assert` action. Always carries a `type` (which runtime check
 * to perform) and `expected` (a free-form string interpreted per `type`).
 */
export const assertionSchema = z.object({
	/** Which assertion to perform. See {@link assertionTypeSchema}. */
	type: assertionTypeSchema,
	/**
	 * What the assertion expects. Interpretation depends on `type`:
	 * for `contains_text` it is a substring; for `element_visible` /
	 * `element_exists` it is a description of the element; for `url_contains`
	 * it is a URL substring; for `map_state` it is a string of `key=value`
	 * pairs (e.g. `"zoom>=10 layer=roads"`); for `compare` it is the textual
	 * hint of which page value to read.
	 */
	expected: z.string(),
})

/** Inferred TypeScript type for {@link assertionSchema}. */
export type Assertion = z.infer<typeof assertionSchema>
/** Inferred TypeScript type for {@link assertionTypeSchema}. */
export type AssertionType = z.infer<typeof assertionTypeSchema>
