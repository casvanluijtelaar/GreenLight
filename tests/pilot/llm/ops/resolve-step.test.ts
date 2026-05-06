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
import { resolveStep } from "../../../../src/pilot/llm/ops/resolve-step.js"
import type { LLMProvider, GenerateRequest } from "../../../../src/pilot/llm/provider.js"
import type { PageState } from "../../../../src/reporter/types.js"

function makeProvider(
	generateImpl: <T>(req: GenerateRequest<T>) => Promise<T>,
): LLMProvider {
	return {
		generate: vi.fn(generateImpl) as unknown as LLMProvider["generate"],
	}
}

const pageState: PageState = {
	a11yTree: [],
	a11yRaw: "",
	url: "https://example.com/login",
	title: "Login",
	consoleLogs: [],
}

describe("resolveStep", () => {
	it("returns the action and updates history on a fresh call", async () => {
		const provider = makeProvider(async <T,>() => ({ action: "click", ref: "e3" }) as T)
		const result = await resolveStep("click submit", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "",
			cache: new Map(),
		})
		expect(result.action).toEqual({ action: "click", ref: "e3" })
		expect(result.newHistory).toHaveLength(2)
		expect(result.newHistory[0].role).toBe("user")
		expect(result.newHistory[1].role).toBe("assistant")
	})

	it("returns the cached action without calling the provider", async () => {
		const cache = new Map([
			[`step\0${pageState.url}`, { action: "click" as const, ref: "e3" }],
		])
		const provider = makeProvider(async () => { throw new Error("should not be called") })
		const result = await resolveStep("step", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "", cache,
		})
		expect(result.action).toEqual({ action: "click", ref: "e3" })
		expect(provider.generate).toHaveBeenCalledTimes(0)
	})

	it("forwards the resolveStepResponseSchema name", async () => {
		const provider = makeProvider(async <T,>() => ({ action: "click", ref: "e1" }) as T)
		await resolveStep("click", pageState, {
			provider, config: { apiKey: "k", model: "m" },
			history: [], prevPageState: null, prevFormattedTree: "", cache: new Map(),
		})
		const req = (provider.generate as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.schemaName).toBe("resolve_step_response")
	})
})
