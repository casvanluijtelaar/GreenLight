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
import { conditionSchema } from "../../../../src/pilot/llm/schemas/condition.js"

describe("conditionSchema", () => {
	it("accepts a valid visible condition", () => {
		expect(conditionSchema.parse({ type: "visible", target: "submit button" }))
			.toEqual({ type: "visible", target: "submit button" })
	})

	it("rejects an unknown type", () => {
		expect(() => conditionSchema.parse({ type: "exists", target: "x" })).toThrow()
	})

	it("rejects missing target", () => {
		expect(() => conditionSchema.parse({ type: "visible" })).toThrow()
	})
})
