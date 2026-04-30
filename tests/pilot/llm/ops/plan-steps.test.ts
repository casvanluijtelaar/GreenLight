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
import { planSteps } from "../../../../src/pilot/llm/ops/plan-steps.js"
import type { LLMProvider } from "../../../../src/pilot/llm/provider.js"

function makeProvider(impl: () => Promise<unknown>): LLMProvider {
	return { generate: vi.fn(impl) }
}

describe("planSteps", () => {
	it("returns the steps from the response", async () => {
		const provider = makeProvider(async () => ({
			steps: [{ kind: "atomic", step: "click", action: { action: "click", ref: "e1" } }],
		}))
		const steps = await planSteps(["click submit"], { provider, config: { apiKey: "k", model: "m" } })
		expect(steps).toHaveLength(1)
		expect(steps[0]).toMatchObject({ kind: "atomic" })
	})

	it("numbers input steps in the user message", async () => {
		const provider = makeProvider(async () => ({ steps: [] }))
		await planSteps(["a", "b", "c"], { provider, config: { apiKey: "k", model: "m" } })
		const req = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.messages[1].content).toBe("1. a\n2. b\n3. c")
	})

	it("forwards the plan_steps schema name", async () => {
		const provider = makeProvider(async () => ({ steps: [] }))
		await planSteps(["a"], { provider, config: { apiKey: "k", model: "m" } })
		const req = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.schemaName).toBe("plan_steps_response")
	})
})
