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

import { describe, it, expect, vi } from "vitest"
import { resolveStepWithPlanner } from "../../../../src/pilot/llm/ops/resolve-with-planner.js"
import type { LLMProvider } from "../../../../src/pilot/llm/provider.js"
import type { PageState } from "../../../../src/reporter/types.js"

function makeProvider(impl: () => Promise<unknown>): LLMProvider {
	return { generate: vi.fn(impl) }
}

const pageState: PageState = {
	a11yTree: [], a11yRaw: "", url: "/", title: "", consoleLogs: [],
}

describe("resolveStepWithPlanner", () => {
	it("returns null when planner equals pilot model", async () => {
		const provider = makeProvider(async () => { throw new Error("should not call") })
		const result = await resolveStepWithPlanner("step", pageState, {
			provider, config: { apiKey: "k", model: "m" }, plannerModel: "m", pilotModel: "m",
		})
		expect(result).toBeNull()
		expect(provider.generate).toHaveBeenCalledTimes(0)
	})

	it("returns the action when planner differs from pilot", async () => {
		const provider = makeProvider(async () => ({ action: { action: "click", ref: "e1" } }))
		const result = await resolveStepWithPlanner("step", pageState, {
			provider, config: { apiKey: "k", model: "p" }, plannerModel: "p", pilotModel: "m",
		})
		expect(result).toEqual({ action: "click", ref: "e1" })
	})
})
