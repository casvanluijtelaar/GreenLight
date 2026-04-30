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
import { createOpenAICompatibleProvider } from "../../../src/pilot/providers/openai-compatible.js"
import { LLMApiError } from "../../../src/pilot/llm/provider.js"

describe("openai-compatible provider generate()", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	it("forwards the JSON Schema in response_format with strict: true", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "thing",
				schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
				strict: true,
			},
		})
	})

	it("returns the parsed JSON object", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(result).toEqual({ ok: true })
	})

	it("throws LLMApiError on non-2xx", async () => {
		fetchMock.mockResolvedValue(new Response("nope", { status: 401 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws on empty content", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: "" } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toThrow(/empty response/)
	})
})
