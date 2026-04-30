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

function makeProvider(generateImpl: (req: GenerateRequest) => Promise<unknown>): LLMProvider {
	return {
		generate: vi.fn(generateImpl),
		chatCompletion: vi.fn().mockRejectedValue(new Error("not used")),
	}
}

describe("complete", () => {
	it("returns the parsed value on first-try success", async () => {
		const provider = makeProvider(async () => ({ ok: true }))
		const result = await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		expect(result).toEqual({ ok: true })
		expect(provider.generate).toHaveBeenCalledTimes(1)
	})

	it("retries once with a correction message when validation fails", async () => {
		let call = 0
		const provider = makeProvider(async () => {
			call++
			return call === 1 ? { not_ok: true } : { ok: true }
		})
		const result = await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		expect(result).toEqual({ ok: true })
		expect(provider.generate).toHaveBeenCalledTimes(2)

		const secondCallMessages = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[1][0].messages
		expect(secondCallMessages).toHaveLength(2)
		expect(secondCallMessages[1].role).toBe("user")
		expect(secondCallMessages[1].content).toMatch(/failed schema validation/)
	})

	it("throws ZodError when both attempts fail validation", async () => {
		const provider = makeProvider(async () => ({ wrong: "shape" }))
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

	it("forwards JSON Schema (not Zod) to the provider", async () => {
		const provider = makeProvider(async () => ({ ok: true }))
		await complete({
			provider, config: { apiKey: "k", model: "m" },
			messages: [{ role: "user", content: "hi" }],
			schema, schemaName: "thing",
		})
		const req = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
		expect(req.schema).toBeTypeOf("object")
		// JSON Schema has a "type" property at the root for object schemas.
		expect((req.schema as { type?: string }).type).toBe("object")
		expect(req.schemaName).toBe("thing")
	})
})
