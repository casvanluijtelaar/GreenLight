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
import type { Page } from "playwright"
import { expandStep } from "../../../../src/pilot/llm/ops/expand-step.js"
import type { LLMProvider } from "../../../../src/pilot/llm/provider.js"
import type { PageState } from "../../../../src/reporter/types.js"

vi.mock("../../../../src/pilot/form-fields.js", () => ({
	captureFormFields: vi.fn(async () => []),
	formatFormFields: vi.fn(() => "(no form fields)"),
}))

function makeProvider(impl: () => Promise<unknown>): LLMProvider {
	return { generate: vi.fn(impl), chatCompletion: vi.fn() }
}

const pageState: PageState = {
	a11yTree: [],
	a11yRaw: "",
	url: "https://example.com/form",
	title: "Form",
	consoleLogs: [],
}

describe("expandStep", () => {
	it("returns the steps from the response and updates history", async () => {
		const provider = makeProvider(async () => ({
			steps: [
				{ kind: "atomic", step: "type name", action: { action: "type", ref: "e1", value: "Alice" } },
				{ kind: "atomic", step: "click submit", action: { action: "click", ref: "e2" } },
			],
		}))
		const result = await expandStep("fill the form", pageState, {} as Page, {
			provider, config: { apiKey: "k", model: "m" }, history: [],
		})
		expect(result.steps).toHaveLength(2)
		expect(result.newHistory).toHaveLength(2)
		expect(result.newHistory[0].role).toBe("user")
		expect(result.newHistory[0].content).toMatch(/Expanded step: fill the form/)
		expect(result.newHistory[1].role).toBe("assistant")
	})

	it("forwards the expand_step schema name", async () => {
		const provider = makeProvider(async () => ({ steps: [] }))
		await expandStep("fill", pageState, {} as Page, {
			provider, config: { apiKey: "k", model: "m" }, history: [],
		})
		const req = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.schemaName).toBe("expand_step_response")
	})

	it("appends to existing history without dropping prior messages", async () => {
		const provider = makeProvider(async () => ({ steps: [] }))
		const priorHistory = [
			{ role: "user" as const, content: "earlier" },
			{ role: "assistant" as const, content: "earlier reply" },
		]
		const result = await expandStep("fill", pageState, {} as Page, {
			provider, config: { apiKey: "k", model: "m" }, history: priorHistory,
		})
		expect(result.newHistory).toHaveLength(4)
		expect(result.newHistory.slice(0, 2)).toEqual(priorHistory)
	})
})
