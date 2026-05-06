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
import { z } from "zod"
import { createClaudeCliProvider } from "../../../../src/pilot/llm/providers/claude-cli.js"
import { LLMApiError } from "../../../../src/pilot/llm/provider.js"

const trivialSchema = z.object({ ok: z.boolean() })
const flexSchema = z.object({ ok: z.boolean(), value: z.number().optional() })

vi.mock("node:child_process", () => ({
	spawnSync: vi.fn(),
}))

import { spawnSync } from "node:child_process"

function streamWith(resultLine: object, prefixLines: object[] = []): string {
	const events = [
		{ type: "system", subtype: "init" },
		...prefixLines,
		{ type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
		resultLine,
	]
	return events.map((e) => JSON.stringify(e)).join("\n") + "\n"
}

function mockOk(structured_output: unknown) {
	vi.mocked(spawnSync).mockReturnValue({
		status: 0,
		stdout: streamWith({ type: "result", is_error: false, result: "", structured_output }),
		stderr: "",
		pid: 0, output: [], signal: null,
	} as ReturnType<typeof spawnSync>)
}

function lastCall() {
	const calls = vi.mocked(spawnSync).mock.calls
	const [, argv, opts] = calls[calls.length - 1]
	return { argv: argv as string[], opts: opts as { input?: string } }
}

describe("claude-cli provider generate()", () => {
	beforeEach(() => {
		vi.mocked(spawnSync).mockReset()
	})

	it("uses --print --verbose with matching stream-json input/output formats and the schema", async () => {
		mockOk({ ok: true })
		const provider = createClaudeCliProvider()
		await provider.generate({
			messages: [{ role: "system", content: "sys" }, { role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		const { argv } = lastCall()
		expect(argv).toContain("--print")
		expect(argv).toContain("--verbose")
		expect(argv[argv.indexOf("--input-format") + 1]).toBe("stream-json")
		expect(argv[argv.indexOf("--output-format") + 1]).toBe("stream-json")
		expect(JSON.parse(argv[argv.indexOf("--json-schema") + 1])).toMatchObject({
			type: "object",
			properties: { ok: { type: "boolean" } },
			required: ["ok"],
		})
	})

	it("does not pass a positional prompt argument", async () => {
		mockOk({ ok: true })
		const provider = createClaudeCliProvider()
		await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		const { argv } = lastCall()
		const known = new Set([
			"--print", "--verbose",
			"--input-format", "stream-json",
			"--output-format", "stream-json",
			"--model", "claude-sonnet-4",
			"--json-schema", "--system-prompt",
		])
		for (const a of argv) {
			if (a.startsWith("--")) continue
			if (known.has(a)) continue
			expect(() => JSON.parse(a)).not.toThrow()
		}
	})

	it("passes the system prompt via --system-prompt and not via stdin", async () => {
		mockOk({ ok: true })
		const provider = createClaudeCliProvider()
		await provider.generate({
			messages: [
				{ role: "system", content: "sys-a" },
				{ role: "system", content: "sys-b" },
				{ role: "user", content: "hi" },
			],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		const { argv, opts } = lastCall()
		expect(argv[argv.indexOf("--system-prompt") + 1]).toBe("sys-a\n\nsys-b")
		expect(opts.input).not.toContain("sys-a")
		expect(opts.input).not.toContain("sys-b")
	})

	it("pipes non-system messages as JSONL on stdin, wrapping assistant content as text blocks", async () => {
		mockOk({ ok: true })
		const provider = createClaudeCliProvider()
		await provider.generate({
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "first" },
				{ role: "assistant", content: "answer" },
				{ role: "user", content: "second" },
			],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		const { opts } = lastCall()
		const lines = (opts.input ?? "").trimEnd().split("\n").map((l) => JSON.parse(l))
		expect(lines).toEqual([
			{ type: "user", message: { role: "user", content: "first" } },
			{
				type: "assistant",
				message: { role: "assistant", content: [{ type: "text", text: "answer" }] },
			},
			{ type: "user", message: { role: "user", content: "second" } },
		])
		expect(opts.input?.endsWith("\n")).toBe(true)
	})

	it("returns structured_output extracted from the final result event in the JSONL stream", async () => {
		mockOk({ ok: true, value: 42 })
		const provider = createClaudeCliProvider()
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: flexSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		expect(result).toEqual({ ok: true, value: 42 })
	})

	it("ignores non-result events that appear before the result line", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stdout: streamWith(
				{ type: "result", is_error: false, structured_output: { ok: true } },
				[
					{ type: "rate_limit_event" },
					{ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "ok" }] } },
				],
			),
			stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})
		expect(result).toEqual({ ok: true })
	})

	it("throws when no non-system messages are provided", async () => {
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "system", content: "only system" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toThrow(/at least one non-system message/)
		expect(vi.mocked(spawnSync)).not.toHaveBeenCalled()
	})

	it("throws LLMApiError on non-zero exit", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 1, stdout: "", stderr: "boom",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws LLMApiError when the result event reports is_error", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stdout: streamWith({ type: "result", is_error: true, result: "model overloaded" }),
			stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws when structured_output is missing from the result event", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stdout: streamWith({ type: "result", is_error: false, result: "i tried but got distracted" }),
			stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toThrow(/no structured_output/)
	})

	it("throws when no result event appears in the stream", async () => {
		vi.mocked(spawnSync).mockReturnValue({
			status: 0,
			stdout: JSON.stringify({ type: "system", subtype: "init" }) + "\n",
			stderr: "",
			pid: 0, output: [], signal: null,
		} as ReturnType<typeof spawnSync>)
		const provider = createClaudeCliProvider()
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema, schemaName: "thing",
			config: { apiKey: "", model: "claude-sonnet-4" },
		})).rejects.toThrow(/no result event/)
	})
})
