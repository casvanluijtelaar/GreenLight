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
import { actionSchema } from "../../../../src/pilot/llm/schemas/action.js"

describe("actionSchema", () => {
	it("accepts a click with ref", () => {
		const action = actionSchema.parse({ action: "click", ref: "e3" })
		expect(action).toEqual({ action: "click", ref: "e3" })
	})

	it("accepts a type with value", () => {
		expect(actionSchema.parse({ action: "type", ref: "e1", value: "hello" }))
			.toEqual({ action: "type", ref: "e1", value: "hello" })
	})

	it("rejects type without value", () => {
		expect(() => actionSchema.parse({ action: "type", ref: "e1" })).toThrow()
	})

	it("accepts an assert with assertion and compare", () => {
		expect(actionSchema.parse({
			action: "assert",
			assertion: { type: "contains_text", expected: "hello" },
			compare: { variable: "count", operator: "equal" },
		})).toEqual({
			action: "assert",
			assertion: { type: "contains_text", expected: "hello" },
			compare: { variable: "count", operator: "equal" },
		})
	})

	it("accepts remember with as", () => {
		expect(actionSchema.parse({ action: "remember", ref: "e2", as: "username" }))
			.toEqual({ action: "remember", ref: "e2", as: "username" })
	})

	it("rejects remember without as", () => {
		expect(() => actionSchema.parse({ action: "remember", ref: "e2" })).toThrow()
	})

	it("rejects unknown action", () => {
		expect(() => actionSchema.parse({ action: "teleport", ref: "e1" })).toThrow()
	})

	it("type narrowing works at compile time", () => {
		const a = actionSchema.parse({ action: "type", ref: "e1", value: "x" })
		if (a.action === "type") {
			// TS should narrow a to the type variant; this is a compile-time check.
			expect(a.value).toBe("x")
		}
	})
})
