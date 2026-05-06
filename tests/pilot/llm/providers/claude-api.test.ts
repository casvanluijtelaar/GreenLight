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
import { z } from "zod"
import { createClaudeApiProvider } from "../../../../src/pilot/llm/providers/claude-api.js"
import { LLMApiError } from "../../../../src/pilot/llm/provider.js"

const trivialSchema = z.object({ ok: z.boolean() })
const flexSchema = z.object({ ok: z.boolean(), value: z.number().optional() })

describe("claude-api provider generate()", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	it("forwards the canonical JSON Schema as tools[0].input_schema with forced tool_choice", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			content: [{ type: "tool_use", name: "thing", input: { ok: true } }],
		}), { status: 200 }))
		const provider = createClaudeApiProvider("https://api.anthropic.com")
		await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.tools).toHaveLength(1)
		expect(body.tools[0].name).toBe("thing")
		expect(body.tools[0].input_schema).toMatchObject({
			type: "object",
			properties: { ok: { type: "boolean" } },
			required: ["ok"],
		})
		expect(body.tool_choice).toEqual({ type: "tool", name: "thing" })
	})

	it("extracts the tool_use input as parsed JSON", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			content: [
				{ type: "text", text: "ignore me" },
				{ type: "tool_use", name: "thing", input: { ok: true, value: 42 } },
			],
		}), { status: 200 }))
		const provider = createClaudeApiProvider("https://api.anthropic.com")
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: flexSchema, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(result).toEqual({ ok: true, value: 42 })
	})

	it("forwards system messages as `system` field", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			content: [{ type: "tool_use", name: "thing", input: { ok: true } }],
		}), { status: 200 }))
		const provider = createClaudeApiProvider("https://api.anthropic.com")
		await provider.generate({
			messages: [
				{ role: "system", content: "be helpful" },
				{ role: "user", content: "hi" },
			],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.system).toBe("be helpful")
		expect(body.messages).toHaveLength(1)
		expect(body.messages[0]).toEqual({ role: "user", content: "hi" })
	})

	it("throws LLMApiError on non-2xx", async () => {
		fetchMock.mockResolvedValue(new Response("nope", { status: 401 }))
		const provider = createClaudeApiProvider("https://api.anthropic.com")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws when no tool_use block is present", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			content: [{ type: "text", text: "I refuse" }],
		}), { status: 200 }))
		const provider = createClaudeApiProvider("https://api.anthropic.com")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toThrow(/empty response/)
	})
})
