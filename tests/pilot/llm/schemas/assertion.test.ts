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
import { assertionSchema } from "../../../../src/pilot/llm/schemas/assertion.js"

describe("assertionSchema", () => {
	it("accepts element_visible", () => {
		expect(assertionSchema.parse({ type: "element_visible", expected: "Submit button" }))
			.toEqual({ type: "element_visible", expected: "Submit button" })
	})

	it("accepts contains_text", () => {
		expect(assertionSchema.parse({ type: "contains_text", expected: "Welcome back" }))
			.toEqual({ type: "contains_text", expected: "Welcome back" })
	})

	it("rejects unknown type", () => {
		expect(() => assertionSchema.parse({ type: "is_blue", expected: "x" })).toThrow()
	})

	it("rejects missing expected", () => {
		expect(() => assertionSchema.parse({ type: "element_visible" })).toThrow()
	})
})
