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
import { evaluateCondition } from "../../../../src/pilot/llm/ops/evaluate-condition.js"
import type { LLMProvider } from "../../../../src/pilot/llm/provider.js"
import type { PageState } from "../../../../src/reporter/types.js"

function makeProvider(impl: () => Promise<unknown>): LLMProvider {
	return { generate: vi.fn(impl) }
}

const pageState: PageState = {
	a11yTree: [], a11yRaw: "", url: "/", title: "", consoleLogs: [],
}

describe("evaluateCondition", () => {
	it("returns true when the provider says result: true", async () => {
		const provider = makeProvider(async () => ({ result: true }))
		const r = await evaluateCondition("submit visible", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "",
		})
		expect(r.result).toBe(true)
	})

	it("returns false when the provider says result: false", async () => {
		const provider = makeProvider(async () => ({ result: false }))
		const r = await evaluateCondition("submit visible", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "",
		})
		expect(r.result).toBe(false)
	})

	it("forwards the evaluate_condition schema name", async () => {
		const provider = makeProvider(async () => ({ result: true }))
		await evaluateCondition("x", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "",
		})
		const req = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.schemaName).toBe("evaluate_condition_response")
	})

	it("appends user + assistant turns to history", async () => {
		const provider = makeProvider(async () => ({ result: true }))
		const r = await evaluateCondition("x", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [{ role: "user", content: "before" }, { role: "assistant", content: "ack" }],
			prevPageState: null, prevFormattedTree: "",
		})
		expect(r.newHistory).toHaveLength(4)
		expect(r.newHistory[2].role).toBe("user")
		expect(r.newHistory[3].role).toBe("assistant")
	})
})
