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
import { createGeminiProvider } from "../../../../src/pilot/llm/providers/gemini.js"
import { LLMApiError } from "../../../../src/pilot/llm/provider.js"

const trivialSchema = z.object({ ok: z.boolean() })
const flexSchema = z.object({ ok: z.boolean(), value: z.number().optional() })

describe("gemini provider generate()", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	it("forwards the canonical JSON Schema as generationConfig.responseJsonSchema with responseMimeType json", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }],
		}), { status: 200 }))
		const provider = createGeminiProvider("https://generativelanguage.googleapis.com")
		await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "gemini-1.5-pro" },
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.generationConfig.responseMimeType).toBe("application/json")
		expect(body.generationConfig.responseJsonSchema).toMatchObject({
			type: "object",
			properties: { ok: { type: "boolean" } },
			required: ["ok"],
		})
	})

	it("returns the parsed and validated JSON object", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true, value: 42 }) }] } }],
		}), { status: 200 }))
		const provider = createGeminiProvider("https://generativelanguage.googleapis.com")
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: flexSchema, schemaName: "thing",
			config: { apiKey: "k", model: "gemini-1.5-pro" },
		})
		expect(result).toEqual({ ok: true, value: 42 })
	})

	it("forwards system messages as systemInstruction", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }],
		}), { status: 200 }))
		const provider = createGeminiProvider("https://generativelanguage.googleapis.com")
		await provider.generate({
			messages: [
				{ role: "system", content: "be helpful" },
				{ role: "user", content: "hi" },
			],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "gemini-1.5-pro" },
		})
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.systemInstruction).toEqual({ parts: [{ text: "be helpful" }] })
		expect(body.contents).toHaveLength(1)
		expect(body.contents[0]).toEqual({ role: "user", parts: [{ text: "hi" }] })
	})

	it("throws LLMApiError on non-2xx", async () => {
		fetchMock.mockResolvedValue(new Response("nope", { status: 401 }))
		const provider = createGeminiProvider("https://generativelanguage.googleapis.com")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "gemini-1.5-pro" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws on empty content", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			candidates: [{ content: { parts: [{ text: "" }] } }],
		}), { status: 200 }))
		const provider = createGeminiProvider("https://generativelanguage.googleapis.com")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "k", model: "gemini-1.5-pro" },
		})).rejects.toThrow(/empty response/)
	})
})
