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

/**
 * Provider-agnostic LLM transport interface.
 *
 * Providers implement two methods during the migration: `chatCompletion`
 * (legacy text-in/text-out, will be removed in Phase D) and `generate`
 * (schema-aware, returns parsed JSON).
 */

export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

export interface ProviderConfig {
	apiKey: string
	model: string
}

export interface GenerateRequest {
	messages: ChatMessage[]
	/** JSON Schema (already converted from Zod by the caller). */
	schema: object
	/** Required by some providers (OpenAI tool name, Anthropic tool name); ignored by others. */
	schemaName: string
	config: ProviderConfig
}

export interface LLMProvider {
	/**
	 * Schema-aware generation. Returns raw JSON; validation happens above
	 * (in `complete<T>`). The provider applies its native structured-output
	 * mechanism (OpenAI response_format, Anthropic tool-use, Gemini responseSchema,
	 * Claude Code --json-schema).
	 */
	generate(req: GenerateRequest): Promise<unknown>

	/**
	 * Legacy text-in/text-out. Will be removed in Phase D once all ops use `generate`.
	 */
	chatCompletion(messages: ChatMessage[], config: ProviderConfig): Promise<string>
}

export class LLMApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message)
		this.name = "LLMApiError"
	}
}
