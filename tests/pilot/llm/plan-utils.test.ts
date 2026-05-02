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
import { fixPlanOrdering, validatePlanReferences } from "../../../src/pilot/llm/plan-utils.js"
import type { PlannedStep } from "../../../src/pilot/llm/schemas/index.js"

const remember = (as: string, step = `remember ${as}`): PlannedStep => ({
	kind: "atomic",
	step,
	action: { action: "remember", ref: "field", as },
})

const count = (as: string, step = `count ${as}`): PlannedStep => ({
	kind: "atomic",
	step,
	action: { action: "count", ref: "list", as },
})

const compare = (variable: string, literal?: string, step = `compare ${variable}`): PlannedStep => ({
	kind: "atomic",
	step,
	action: {
		action: "assert",
		assertion: { type: "compare", expected: "" },
		compare: { variable, operator: "equal", ...(literal !== undefined ? { literal } : {}) },
	},
})

const assertNoCompare = (step = "assert visible"): PlannedStep => ({
	kind: "atomic",
	step,
	action: { action: "assert", assertion: { type: "element_visible", expected: "" }, ref: "x" },
})

const click = (step = "click button"): PlannedStep => ({
	kind: "atomic",
	step,
	action: { action: "click", ref: "button" },
})

const expand = (step = "fill the form"): PlannedStep => ({ kind: "expand", step })

describe("fixPlanOrdering", () => {
	it("swaps a remember followed by a compare on the same variable", () => {
		const plan: PlannedStep[] = [remember("price"), compare("price")]

		fixPlanOrdering(plan)

		expect(plan[0].step).toBe("compare price")
		expect(plan[1].step).toBe("remember price")
	})

	it("swaps a count followed by a compare on the same variable", () => {
		const plan: PlannedStep[] = [count("items"), compare("items")]

		fixPlanOrdering(plan)

		expect(plan[0].step).toBe("compare items")
		expect(plan[1].step).toBe("count items")
	})

	it("does not swap when the next compare targets a different variable", () => {
		const plan: PlannedStep[] = [remember("price"), compare("other")]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("does not swap when the next step is an assert without a compare clause", () => {
		const plan: PlannedStep[] = [remember("price"), assertNoCompare()]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("does not swap when the next step is an atomic non-assert action", () => {
		const plan: PlannedStep[] = [remember("price"), click()]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("does not swap when the next step is non-atomic", () => {
		const plan: PlannedStep[] = [remember("price"), expand()]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("ignores leading non-atomic steps when scanning for remembers", () => {
		const plan: PlannedStep[] = [expand(), compare("price")]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("ignores leading atomic non-remember actions", () => {
		const plan: PlannedStep[] = [click(), compare("price")]
		const before = plan.map((s) => s.step)

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(before)
	})

	it("does not pair a swapped remember with the following step", () => {
		// Without the i++ skip, after swapping (R,C) the loop would re-examine
		// the moved remember at i+1 and could chain into a second swap.
		// Here the third step is another compare on "price"; the post-swap
		// remember at index 1 must NOT swap with the compare at index 2.
		const plan: PlannedStep[] = [remember("price"), compare("price"), compare("price")]

		fixPlanOrdering(plan)

		expect(plan.map((s) => s.step)).toEqual(["compare price", "remember price", "compare price"])
	})

	it("returns immediately on an empty plan", () => {
		const plan: PlannedStep[] = []

		fixPlanOrdering(plan)

		expect(plan).toEqual([])
	})

	it("returns immediately on a single-step plan", () => {
		const plan: PlannedStep[] = [remember("price")]

		fixPlanOrdering(plan)

		expect(plan).toHaveLength(1)
		expect(plan[0].step).toBe("remember price")
	})
})

describe("validatePlanReferences", () => {
	it("returns no errors when every COMPARE has a preceding REMEMBER", () => {
		const plan: PlannedStep[] = [remember("price"), compare("price")]

		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("treats a COUNT as a valid remembered source", () => {
		const plan: PlannedStep[] = [count("items"), compare("items")]

		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("reports an error when a COMPARE references an unknown variable", () => {
		const plan: PlannedStep[] = [compare("price")]

		const errors = validatePlanReferences(plan)

		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain('"price"')
		expect(errors[0]).toMatch(/no REMEMBER/)
	})

	it("reports an error when REMEMBER appears AFTER its COMPARE", () => {
		const plan: PlannedStep[] = [compare("price"), remember("price")]

		const errors = validatePlanReferences(plan)

		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain('"price"')
	})

	it("skips validation for compare clauses with a literal", () => {
		// literal-only comparisons (variable === "_" with literal set, or any
		// compare with literal set) do not require a prior REMEMBER.
		const plan: PlannedStep[] = [compare("_", "42")]

		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("ignores non-atomic and non-assert steps when scanning", () => {
		const plan: PlannedStep[] = [expand(), click(), assertNoCompare(), remember("x"), compare("x")]

		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("collects multiple errors across the plan", () => {
		const plan: PlannedStep[] = [compare("a"), compare("b"), remember("c"), compare("c")]

		const errors = validatePlanReferences(plan)

		expect(errors).toHaveLength(2)
		expect(errors[0]).toContain('"a"')
		expect(errors[1]).toContain('"b"')
	})
})
