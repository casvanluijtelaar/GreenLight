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

/** Comparison operator. Mirrors the existing Action.compare.operator union. */
export const compareOperatorSchema = z.enum([
	"less_than",
	"greater_than",
	"equal",
	"not_equal",
	"less_or_equal",
	"greater_or_equal",
])

export type CompareOperator = z.infer<typeof compareOperatorSchema>

/** Comparison clause attached to assert actions. */
export const compareSchema = z.object({
	/** Remembered variable name, or "_" when comparing against a literal only. */
	variable: z.string(),
	operator: compareOperatorSchema,
	/** When set, compare against this literal instead of (or in addition to) a remembered variable. */
	literal: z.string().optional(),
})

export type Compare = z.infer<typeof compareSchema>
