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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createLLMClient, resolveApiKey, resolveLLMConfig } from "../../src/pilot/llm.js"
import type { LLMProvider } from "../../src/pilot/llm/provider.js"
import type { PageState } from "../../src/reporter/types.js"
import type { RunConfig } from "../../src/types.js"
import { DEFAULTS } from "../../src/types.js"

function makeProvider(generateImpl: () => Promise<unknown>): LLMProvider {
	return {
		generate: vi.fn(generateImpl),
	}
}

const pageState: PageState = {
	a11yTree: [], a11yRaw: "", url: "https://example.com/", title: "x", consoleLogs: [],
}

describe("createLLMClient (facade)", () => {
	it("resolveStep returns the action and accumulates history", async () => {
		const provider = makeProvider(async () => ({ action: { action: "click", ref: "e1" } }))
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "p", pilotModel: "m" })

		const a1 = await client.resolveStep("step 1", pageState)
		expect(a1).toEqual({ action: "click", ref: "e1" })
		expect(provider.generate).toHaveBeenCalledTimes(1)
	})

	it("resetHistory clears state so the next call starts fresh", async () => {
		const provider = makeProvider(async () => ({ action: { action: "click", ref: "e1" } }))
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "p", pilotModel: "m" })

		await client.resolveStep("step 1", pageState)
		client.resetHistory()
		await client.resolveStep("step 2", pageState)

		// Both calls should send only system + user (no history); inspect the second call's messages
		const secondCall = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][0]
		expect(secondCall.messages).toHaveLength(2)   // system + user only
	})

	it("planSteps returns the steps from the response", async () => {
		const provider = makeProvider(async () => ({
			steps: [{ kind: "atomic", step: "click submit", action: { action: "click", ref: "e1" }, inputStepIndex: 0 }],
		}))
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "p", pilotModel: "m" })
		const steps = await client.planSteps(["click the submit button"])
		expect(steps).toHaveLength(1)
		expect(steps[0]).toMatchObject({ kind: "atomic" })
	})

	it("evaluateCondition returns the boolean", async () => {
		const provider = makeProvider(async () => ({ result: true }))
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "p", pilotModel: "m" })
		const r = await client.evaluateCondition("submit visible", "visible", pageState)
		expect(r).toBe(true)
	})

	it("resolveStepWithPlanner returns null when planner equals pilot model", async () => {
		const provider = makeProvider(async () => { throw new Error("should not be called") })
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "m", pilotModel: "m" })
		const r = await client.resolveStepWithPlanner("step", pageState)
		expect(r).toBeNull()
	})

	it("LLM API errors propagate to the caller", async () => {
		const { LLMApiError } = await import("../../src/pilot/llm/provider.js")
		const provider = makeProvider(async () => { throw new LLMApiError(500, "boom") })
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "p", pilotModel: "m" })
		await expect(client.resolveStep("step", pageState)).rejects.toBeInstanceOf(LLMApiError)
	})

	it("accumulates conversation history across resolveStep calls", async () => {
		let callCount = 0
		const provider = makeProvider(async () => {
			callCount++
			return { action: { action: "click", ref: callCount === 1 ? "e1" : "e2" } }
		})
		const client = createLLMClient({ apiKey: "k", provider, plannerModel: "m", pilotModel: "m" })

		await client.resolveStep("step 1", pageState)
		await client.resolveStep("step 2", { ...pageState, url: "https://example.com/other" })

		// Second call should include history from first call: system + user1 + assistant1 + user2 = 4
		const secondCall = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][0]
		expect(secondCall.messages).toHaveLength(4)
	})
})

describe("resolveApiKey", () => {
	const originalEnv = process.env

	beforeEach(() => {
		process.env = { ...originalEnv }
		delete process.env.OPENROUTER_API_KEY
		delete process.env.LLM_API_KEY
	})

	afterEach(() => {
		process.env = originalEnv
	})

	it("reads LLM_API_KEY", () => {
		process.env.LLM_API_KEY = "sk-generic"
		expect(resolveApiKey()).toBe("sk-generic")
	})

	it("falls back to OPENROUTER_API_KEY", () => {
		process.env.OPENROUTER_API_KEY = "sk-or-test"
		expect(resolveApiKey()).toBe("sk-or-test")
	})

	it("prefers LLM_API_KEY over OPENROUTER_API_KEY", () => {
		process.env.LLM_API_KEY = "sk-gen"
		process.env.OPENROUTER_API_KEY = "sk-or"
		expect(resolveApiKey()).toBe("sk-gen")
	})

	it("throws when no key is set", () => {
		expect(() => resolveApiKey()).toThrow("No API key found")
	})
})

describe("resolveLLMConfig", () => {
	const originalEnv = process.env

	beforeEach(() => {
		process.env = { ...originalEnv }
		process.env.LLM_API_KEY = "sk-test"
	})

	afterEach(() => {
		process.env = originalEnv
	})

	it("resolves config from RunConfig", () => {
		const runConfig: RunConfig = {
			...DEFAULTS,
			suiteFiles: [],
			model: "openai/gpt-4o",
			provider: "openrouter",
		}
		const config = resolveLLMConfig(runConfig)
		expect(config.apiKey).toBe("sk-test")
		expect(config.plannerModel).toBe("openai/gpt-4o")
		expect(config.pilotModel).toBe("openai/gpt-4o")
		expect(config.provider).toBeDefined()
	})

	it("resolves ModelConfig with different planner/pilot", () => {
		const runConfig: RunConfig = {
			...DEFAULTS,
			suiteFiles: [],
			model: { planner: "openai/gpt-4o", pilot: "openai/gpt-4o-mini" },
			provider: "openai",
		}
		const config = resolveLLMConfig(runConfig)
		expect(config.plannerModel).toBe("openai/gpt-4o")
		expect(config.pilotModel).toBe("openai/gpt-4o-mini")
	})

	it("does not require an API key when provider is claude-code", () => {
		delete process.env.LLM_API_KEY
		delete process.env.OPENROUTER_API_KEY

		const runConfig = {
			...DEFAULTS,
			suiteFiles: [],
			provider: "claude-code",
			model: "anthropic/claude-sonnet-4",
		} as RunConfig

		expect(() => resolveLLMConfig(runConfig)).not.toThrow()
		const config = resolveLLMConfig(runConfig)
		expect(config.apiKey).toBe("")
	})
})
