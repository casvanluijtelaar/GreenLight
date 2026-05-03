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
import { createPlanRecorder } from "../../src/planner/plan-generator.js"
import type { ExecutionResult, Action } from "../../src/reporter/types.js"

const okResult: ExecutionResult = { ok: true }
const fingerprint = { url: "https://example.com/x", title: "X" }

function recordOne(action: Action) {
	const recorder = createPlanRecorder("suite", "test", "hash", "claude-sonnet-4-5")
	recorder.recordStep(action.action, action, okResult, fingerprint)
	return recorder.finalize().steps[0]
}

describe("plan-generator field mapping (Action → HeuristicStep)", () => {
	it("maps select.option to step.value (the runner reads value, not option, for select)", () => {
		const step = recordOne({ action: "select", ref: "e1", option: "GA4" })
		expect(step.value).toBe("GA4")
		expect(step.option).toBeUndefined()
	})

	it("preserves both value (search text) and option (suggestion pick) for autocomplete", () => {
		const step = recordOne({
			action: "autocomplete", ref: "e1", value: "stockh", option: "Stockholm",
		})
		expect(step.value).toBe("stockh")
		expect(step.option).toBe("Stockholm")
	})

	it("copies rememberAs through verbatim for remember", () => {
		const step = recordOne({ action: "remember", ref: "e1", rememberAs: "total_price" })
		expect(step.rememberAs).toBe("total_price")
	})

	it("copies rememberAs through verbatim for count", () => {
		const step = recordOne({ action: "count", text: "product card", rememberAs: "product_count" })
		expect(step.rememberAs).toBe("product_count")
	})

	it("copies value through verbatim for type", () => {
		const step = recordOne({ action: "type", ref: "e1", value: "hello@example.com" })
		expect(step.value).toBe("hello@example.com")
	})

	it("copies value through verbatim for navigate", () => {
		const step = recordOne({ action: "navigate", value: "/dashboard" })
		expect(step.value).toBe("/dashboard")
	})
})
