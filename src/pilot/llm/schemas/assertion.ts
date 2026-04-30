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
 * Assertion type and shape. The enum mirrors the cases handled by
 * src/pilot/assertions.ts::buildAssertionCheck (and executeMapAssertion for
 * map-related assertions). Adding or removing a case here without updating
 * the runtime (or vice versa) will produce a ZodError no consumer can fix.
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
])

export const assertionSchema = z.object({
	type: assertionTypeSchema,
	expected: z.string(),
})

export type Assertion = z.infer<typeof assertionSchema>
export type AssertionType = z.infer<typeof assertionTypeSchema>
