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
import {
	type ChatMessage,
	type LLMProvider,
	type ProviderConfig,
	LLMApiError,
} from "./types.js"

/**
 * Flatten a ChatMessage[] into a single prompt string for the claude CLI.
 * System messages are prepended as context; conversation turns follow
 * in Human/Assistant format.
 */
function serializeMessages(messages: ChatMessage[]): string {
	const system = messages.filter((m) => m.role === "system")
	const conversation = messages.filter((m) => m.role !== "system")

	const parts: string[] = []

	if (system.length > 0) {
		parts.push(system.map((m) => m.content).join("\n\n"))
	}

	for (const msg of conversation) {
		if (msg.role === "user") {
			parts.push(`Human: ${msg.content}`)
		} else if (msg.role === "assistant") {
			parts.push(`Assistant: ${msg.content}`)
		}
	}

	return parts.join("\n\n")
}

/**
 * Provider that delegates to the local `claude` CLI subprocess.
 * Requires Claude Code to be installed and authenticated — no API key needed.
 */
export function createClaudeCodeProvider(): LLMProvider {
	return {
		async chatCompletion(
			messages: ChatMessage[],
			config: ProviderConfig,
		): Promise<string> {
			const prompt = serializeMessages(messages)
			// Strip vendor prefix: "anthropic/claude-sonnet-4" → "claude-sonnet-4"
			const cliModel = config.model.includes("/")
				? (config.model.split("/").pop() ?? config.model)
				: config.model

			const result = spawnSync(
				"claude",
				["--model", cliModel, "--output-format", "text", "-p", prompt],
				{
					encoding: "utf8",
					maxBuffer: 10 * 1024 * 1024,
				},
			)

			if (result.error) {
				throw new Error(
					`claude CLI not found. Install and authenticate Claude Code: ${result.error.message}`,
				)
			}

			if (result.status !== 0) {
				throw new LLMApiError(
					result.status ?? 1,
					result.stderr || "claude exited with non-zero status",
				)
			}

			const content = result.stdout.trim()
			if (!content) {
				throw new Error("LLM returned empty response")
			}

			return content
		},
	}
}
