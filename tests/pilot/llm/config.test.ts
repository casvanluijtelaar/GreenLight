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

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { resolveApiKey, resolveLLMConfig } from "../../../src/pilot/llm/index.js"
import type { RunConfig } from "../../../src/types.js"
import { DEFAULTS } from "../../../src/types.js"

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

	it("does not require an API key when provider is claude-cli", () => {
		delete process.env.LLM_API_KEY
		delete process.env.OPENROUTER_API_KEY

		const runConfig = {
			...DEFAULTS,
			suiteFiles: [],
			provider: "claude-cli",
			model: "anthropic/claude-sonnet-4",
		} as RunConfig

		expect(() => resolveLLMConfig(runConfig)).not.toThrow()
		const config = resolveLLMConfig(runConfig)
		expect(config.apiKey).toBe("")
	})
})
