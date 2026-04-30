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
import { createClaudeCodeProvider } from "../../../src/pilot/providers/claude-code.js"
import { LLMApiError } from "../../../src/pilot/providers/types.js"
import type { ChatMessage } from "../../../src/pilot/providers/types.js"

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}))

import { spawnSync } from "node:child_process"
const mockSpawnSync = vi.mocked(spawnSync)

const messages: ChatMessage[] = [
	{ role: "system", content: "You are a browser automation AI." },
	{ role: "user", content: "click the login button" },
]

const messagesWithHistory: ChatMessage[] = [
	{ role: "system", content: "You are a browser automation AI." },
	{ role: "user", content: "click the login button" },
	{ role: "assistant", content: 'click ref=e1' },
	{ role: "user", content: "check the page title" },
]

describe("createClaudeCodeProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns an LLMProvider with a chatCompletion method", () => {
		const provider = createClaudeCodeProvider()
		expect(typeof provider.chatCompletion).toBe("function")
	})

	it("calls spawnSync with the claude binary and model flag", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: 'click ref=e3',
			stderr: "",
			status: 0,
			error: undefined,
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		await provider.chatCompletion(messages, { apiKey: "", model: "claude-sonnet-4-5" })

		expect(mockSpawnSync).toHaveBeenCalledWith(
			"claude",
			expect.arrayContaining(["--model", "claude-sonnet-4-5"]),
			expect.objectContaining({ encoding: "utf8" }),
		)
	})

	it("returns trimmed stdout on success", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: '  click ref=e3\n',
			stderr: "",
			status: 0,
			error: undefined,
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		const result = await provider.chatCompletion(messages, { apiKey: "", model: "claude-sonnet-4-5" })

		expect(result).toBe("click ref=e3")
	})

	it("passes system message via -s and conversation turns via -p", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: 'click ref=e5',
			stderr: "",
			status: 0,
			error: undefined,
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		await provider.chatCompletion(messagesWithHistory, { apiKey: "", model: "claude-sonnet-4-5" })

		const call = mockSpawnSync.mock.calls[0]
		const args = call[1] as string[]

		expect(args[args.indexOf("--system-prompt") + 1]).toBe("You are a browser automation AI.")

		const promptArg = args[args.indexOf("-p") + 1]
		expect(promptArg).not.toContain("You are a browser automation AI.")
		expect(promptArg).toContain("click the login button")
		expect(promptArg).toContain("click ref=e1")
		expect(promptArg).toContain("check the page title")
	})

	it("throws a descriptive Error when claude binary is not found", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: "",
			stderr: "",
			status: null,
			error: new Error("ENOENT"),
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		await expect(
			provider.chatCompletion(messages, { apiKey: "", model: "claude-sonnet-4-5" }),
		).rejects.toThrow("claude CLI not found")
	})

	it("throws LLMApiError when claude exits non-zero", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: "",
			stderr: "Authentication failed",
			status: 1,
			error: undefined,
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		await expect(
			provider.chatCompletion(messages, { apiKey: "", model: "claude-sonnet-4-5" }),
		).rejects.toThrow(LLMApiError)
	})

	it("throws Error on empty stdout", async () => {
		mockSpawnSync.mockReturnValue({
			stdout: "   ",
			stderr: "",
			status: 0,
			error: undefined,
		} as unknown as ReturnType<typeof spawnSync>)

		const provider = createClaudeCodeProvider()
		await expect(
			provider.chatCompletion(messages, { apiKey: "", model: "claude-sonnet-4-5" }),
		).rejects.toThrow("LLM returned empty response")
	})
})

describe("claude-code provider generate()", () => {
	beforeEach(() => {
		vi.mocked(spawnSync).mockReset()
	})

	it("passes the JSON schema as --json-schema", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0, stdout: JSON.stringify({ ok: true }), stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCodeProvider()
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
		const provider = createClaudeCodeProvider()
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
		const provider = createClaudeCodeProvider()
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
		const provider = createClaudeCodeProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: {}, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toThrow(/empty response/)
	})
})
