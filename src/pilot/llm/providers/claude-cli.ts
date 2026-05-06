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

import { spawnSync } from "node:child_process"
import type { ChatMessage, GenerateRequest, LLMProvider } from "../provider.js"
import { LLMApiError } from "../provider.js"
import { callWithJsonSchema } from "./_helpers.js"

interface ClaudeCliResultEvent {
	type: "result"
	is_error: boolean
	result?: string
	structured_output?: unknown
}

/**
 * Build the JSONL stdin payload for `--input-format stream-json`. One line per
 * non-system message; the system prompt is passed separately via
 * `--system-prompt`. Format mirrors the Agent SDK's streaming-input shape.
 *
 * Assistant `content` MUST be an array of content blocks. The CLI's input
 * parser iterates content blocks looking for `tool_use_id`, and crashes with
 * "W is not an Object" if it encounters a plain string instead of objects.
 * User content can stay as a plain string (the CLI accepts both there).
 */
function buildStreamJsonInput(messages: ChatMessage[]): string {
	const lines = messages
		.filter((m) => m.role !== "system")
		.map((m) => {
			const content = m.role === "assistant"
				? [{ type: "text", text: m.content }]
				: m.content
			return JSON.stringify({ type: m.role, message: { role: m.role, content } })
		})
	return lines.length === 0 ? "" : `${lines.join("\n")}\n`
}

/**
 * Scan the CLI's JSONL output stream for the final `result` event. Other
 * event types (system, assistant, user, rate_limit_event) are ignored.
 */
function findResultEvent(stdout: string): ClaudeCliResultEvent | undefined {
	const lines = stdout.split("\n")
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim()
		if (!line) continue
		try {
			const parsed = JSON.parse(line) as { type?: string }
			if (parsed.type === "result") return parsed as ClaudeCliResultEvent
		} catch {
			// Not JSON; ignore.
		}
	}
	return undefined
}

/**
 * Provider that delegates to the local `claude` CLI subprocess.
 * Requires Claude Code to be installed and authenticated. No API key needed.
 *
 * Pipes the conversation as JSONL on stdin via `--input-format stream-json`
 * to preserve real user/assistant turn boundaries. The CLI requires the
 * matching `--output-format stream-json --verbose` combination, so we parse
 * the JSONL event stream on stdout and pull the final `result` event.
 */
export function createClaudeCliProvider(): LLMProvider {
	return {
		async generate<T>(req: GenerateRequest<T>): Promise<T> {
			return callWithJsonSchema(req, async (jsonSchema) => {
				const systemText = req.messages
					.filter((m) => m.role === "system")
					.map((m) => m.content)
					.join("\n\n")
				const stdin = buildStreamJsonInput(req.messages)
				if (!stdin) throw new Error("claude CLI requires at least one non-system message")

				const args = [
					"--print",
					"--verbose",
					"--input-format", "stream-json",
					"--output-format", "stream-json",
					"--model", req.config.model,
					"--json-schema", JSON.stringify(jsonSchema),
				]
				if (systemText) args.push("--system-prompt", systemText)

				const result = spawnSync("claude", args, {
					encoding: "utf8",
					maxBuffer: 100 * 1024 * 1024,
					timeout: 120_000,
					input: stdin,
				})

				if (result.error) {
					throw new Error(
						`claude CLI not found. Install and authenticate Claude Code: ${result.error.message}`,
					)
				}
				if (result.status !== 0) {
					const statusStr = result.status === null ? "null" : String(result.status)
					const signalStr = result.signal ? ` signal=${String(result.signal)}` : ""
					const stderr = (result.stderr ?? "").trim()
					const stdoutTail = (result.stdout ?? "").trim().slice(-2000)
					const detail = [
						stderr ? `stderr:\n${stderr}` : "",
						stdoutTail ? `stdout (last 2000 chars):\n${stdoutTail}` : "",
					].filter(Boolean).join("\n\n") || "(no stderr or stdout)"
					throw new LLMApiError(
						result.status ?? 1,
						`claude exited status=${statusStr}${signalStr}\n${detail}`,
					)
				}

				const event = findResultEvent(result.stdout)
				if (!event) {
					throw new Error(
						`claude CLI produced no result event. Last 1000 chars of stdout: ${result.stdout.slice(-1000)}`,
					)
				}
				if (event.is_error) {
					throw new LLMApiError(1, event.result ?? "claude CLI returned an error")
				}
				if (event.structured_output === undefined) {
					throw new Error(
						`claude CLI returned no structured_output. Result: ${event.result ?? "(empty)"}`,
					)
				}
				return event.structured_output
			})
		},
	}
}
