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
 * Condition for conditional planned steps (IF_VISIBLE / IF_CONTAINS / IF_URL).
 * Mirrors src/pilot/conditions.ts::Condition. The runtime evaluator in
 * conditions.ts will switch on `type`.
 */
export const conditionSchema = z.object({
	type: z.enum(["visible", "contains", "url"]),
	target: z.string(),
})

export type Condition = z.infer<typeof conditionSchema>
