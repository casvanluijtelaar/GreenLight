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
 * Each provider receives a Zod schema and returns the parsed, typed value.
 * Schema-to-JSON-Schema conversion and validation live inside each provider
 * so the OpenAI provider can transform the schema locally for its strict
 * mode without bothering the rest of the codebase.
 */
import type { z } from "zod"

export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

export interface ProviderConfig {
	apiKey: string
	model: string
}

export interface GenerateRequest<T> {
	messages: ChatMessage[]
	/** The Zod schema describing the expected response shape (canonical form). */
	schema: z.ZodType<T>
	/** Stable identifier (OpenAI tool name, Anthropic tool name). */
	schemaName: string
	config: ProviderConfig
}

export interface LLMProvider {
	/**
	 * Schema-aware generation. Each provider:
	 *   1. Converts `req.schema` to JSON Schema (and may transform it for the
	 *      native API's quirks — see openai-compatible.ts).
	 *   2. Calls the native structured-output mechanism.
	 *   3. Validates the response with `req.schema.parse(...)` and returns T.
	 *
	 * `ZodError` from the parse step bubbles up to `complete<T>` which retries
	 * once with a correction message.
	 */
	generate<T>(req: GenerateRequest<T>): Promise<T>
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
