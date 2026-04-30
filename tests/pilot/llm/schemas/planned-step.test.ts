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
import { plannedStepSchema } from "../../../../src/pilot/llm/schemas/planned-step.js"

describe("plannedStepSchema", () => {
	it("accepts an atomic step with click action", () => {
		expect(plannedStepSchema.parse({
			kind: "atomic",
			step: "click submit",
			action: { action: "click", ref: "e3" },
		})).toEqual({
			kind: "atomic",
			step: "click submit",
			action: { action: "click", ref: "e3" },
		})
	})

	it("accepts an expand step", () => {
		expect(plannedStepSchema.parse({ kind: "expand", step: "fill the form" }))
			.toEqual({ kind: "expand", step: "fill the form" })
	})

	it("accepts a conditional step with then branch", () => {
		expect(plannedStepSchema.parse({
			kind: "conditional",
			step: "if visible",
			condition: { type: "visible", target: "submit" },
			thenBranch: [{
				kind: "atomic",
				step: "click submit",
				action: { action: "click", ref: "e3" },
			}],
		})).toMatchObject({ kind: "conditional", thenBranch: [{ kind: "atomic" }] })
	})

	it("accepts a conditional step with then and else branches", () => {
		const parsed = plannedStepSchema.parse({
			kind: "conditional",
			step: "if visible else navigate",
			condition: { type: "visible", target: "submit" },
			thenBranch: [{ kind: "atomic", step: "click", action: { action: "click", ref: "e3" } }],
			elseBranch: [{ kind: "atomic", step: "go", action: { action: "navigate", value: "/" } }],
		})
		expect(parsed).toMatchObject({
			kind: "conditional",
			thenBranch: [{ kind: "atomic" }],
			elseBranch: [{ kind: "atomic" }],
		})
	})

	it("rejects an atomic step missing an action", () => {
		expect(() => plannedStepSchema.parse({ kind: "atomic", step: "x" })).toThrow()
	})

	it("rejects unknown kind", () => {
		expect(() => plannedStepSchema.parse({ kind: "skip", step: "x" })).toThrow()
	})
})
