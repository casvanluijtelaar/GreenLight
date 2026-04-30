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

import { describe, it, expect } from "vitest"
import { compareSchema, compareOperatorSchema } from "../../../../src/pilot/llm/schemas/compare.js"

describe("compareOperatorSchema", () => {
	it.each(["less_than", "greater_than", "equal", "not_equal", "less_or_equal", "greater_or_equal"])(
		"accepts %s",
		(op) => {
			expect(compareOperatorSchema.parse(op)).toBe(op)
		},
	)
	it("rejects unknown operator", () => {
		expect(() => compareOperatorSchema.parse("approximately")).toThrow()
	})
})

describe("compareSchema", () => {
	it("accepts a variable comparison", () => {
		expect(compareSchema.parse({ variable: "count", operator: "greater_than" }))
			.toEqual({ variable: "count", operator: "greater_than" })
	})
	it("accepts a literal comparison", () => {
		expect(compareSchema.parse({ variable: "_", operator: "equal", literal: "5" }))
			.toEqual({ variable: "_", operator: "equal", literal: "5" })
	})
	it("rejects missing operator", () => {
		expect(() => compareSchema.parse({ variable: "count" })).toThrow()
	})
})
