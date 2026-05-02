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

import { describe, it, expect, vi, beforeEach } from "vitest"
import { createClaudeCliProvider } from "../../../../src/pilot/llm/providers/claude-cli.js"
import { LLMApiError } from "../../../../src/pilot/llm/provider.js"

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}))

import { spawnSync } from "node:child_process"

describe("claude-cli provider generate()", () => {
	beforeEach(() => {
		vi.mocked(spawnSync).mockReset()
	})

	it("passes the JSON schema as --json-schema", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0, stdout: JSON.stringify({ ok: true }), stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await provider.generate({
			messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
			schema: { type: "object", properties: { ok: { type: "boolean" } } },
			schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		const argv = vi.mocked(spawnSync).mock.calls[0][1] as string[]
		const idx = argv.indexOf("--json-schema")
		expect(idx).toBeGreaterThanOrEqual(0)
		expect(JSON.parse(argv[idx + 1])).toEqual({ type: "object", properties: { ok: { type: "boolean" } } })
	})

	it("returns parsed JSON from stdout", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0, stdout: JSON.stringify({ ok: true, value: 42 }), stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		expect(result).toEqual({ ok: true, value: 42 })
	})

	it("throws LLMApiError on non-zero exit", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 1, stdout: "", stderr: "boom",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws on empty stdout", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0, stdout: "", stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toThrow(/empty response/)
	})
})
