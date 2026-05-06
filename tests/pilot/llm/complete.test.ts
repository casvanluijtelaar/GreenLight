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
import { z } from "zod"
import { complete } from "../../../src/pilot/llm/complete.js"
import type { LLMProvider, GenerateRequest } from "../../../src/pilot/llm/provider.js"
import { LLMApiError } from "../../../src/pilot/llm/provider.js"

const schema = z.object({ ok: z.boolean() })

function makeProvider(
	generateImpl: <T>(req: GenerateRequest<T>) => Promise<T>,
): LLMProvider {
	return {
		generate: vi.fn(generateImpl) as unknown as LLMProvider["generate"],
	}
}

describe("complete", () => {
	it("returns the parsed value on first-try success", async () => {
		const provider = makeProvider(async <T,>() => ({ ok: true }) as T)
		const result = await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		expect(result).toEqual({ ok: true })
		expect(provider.generate).toHaveBeenCalledTimes(1)
	})

	it("retries once with a correction message when the provider throws ZodError", async () => {
		let call = 0
		const provider = makeProvider(async <T,>(req: GenerateRequest<T>) => {
			call++
			if (call === 1) {
				// Simulate validation failure inside the provider.
				return req.schema.parse({ not_ok: true }) as T
			}
			return { ok: true } as T
		})
		const result = await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		expect(result).toEqual({ ok: true })
		expect(provider.generate).toHaveBeenCalledTimes(2)

		const secondCallMessages =
			(provider.generate as unknown as ReturnType<typeof vi.fn>).mock.calls[1][0].messages
		expect(secondCallMessages).toHaveLength(2)
		expect(secondCallMessages[1].role).toBe("user")
		expect(secondCallMessages[1].content).toMatch(/failed schema validation/)
	})

	it("throws ZodError when both attempts fail validation", async () => {
		const provider = makeProvider(async <T,>(req: GenerateRequest<T>) => {
			return req.schema.parse({ wrong: "shape" }) as T
		})
		await expect(complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})).rejects.toBeInstanceOf(z.ZodError)
		expect(provider.generate).toHaveBeenCalledTimes(2)
	})

	it("does not retry on LLMApiError", async () => {
		const provider = makeProvider(async () => { throw new LLMApiError(500, "boom") })
		await expect(complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})).rejects.toBeInstanceOf(LLMApiError)
		expect(provider.generate).toHaveBeenCalledTimes(1)
	})

	it("passes the Zod schema directly to the provider", async () => {
		const provider = makeProvider(async <T,>() => ({ ok: true }) as T)
		await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		const req = (provider.generate as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
		// Same Zod schema instance (not a JSON Schema object).
		expect(req.schema).toBe(schema)
		expect(req.schemaName).toBe("thing")
	})
})
