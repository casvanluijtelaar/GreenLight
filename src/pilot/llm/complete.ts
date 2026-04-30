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

import { z } from "zod"
import type { ChatMessage, LLMProvider, ProviderConfig } from "./provider.js"

export interface CompleteOptions<T> {
	provider: LLMProvider
	config: ProviderConfig
	messages: ChatMessage[]
	schema: z.ZodType<T>
	schemaName: string
}

/**
 * Schema-aware completion with one bounded retry on validation failure.
 *
 * Flow: Zod -> JSON Schema -> provider.generate -> Zod parse. If parsing
 * fails on the first attempt, append a correction message containing the
 * Zod error and call the provider once more. If the second attempt also
 * fails, the ZodError is thrown.
 *
 * LLMApiError (network/auth/5xx) is not retried; it bubbles to the caller.
 */
export async function complete<T>(opts: CompleteOptions<T>): Promise<T> {
	const jsonSchema = z.toJSONSchema(opts.schema, { target: "draft-7" }) as object
	const call = (messages: ChatMessage[]) =>
		opts.provider.generate({
			messages,
			schema: jsonSchema,
			schemaName: opts.schemaName,
			config: opts.config,
		})

	const first = opts.schema.safeParse(await call(opts.messages))
	if (first.success) return first.data

	const correction: ChatMessage = {
		role: "user",
		content: `Your previous response failed schema validation:\n${first.error.message}\nReturn a corrected response that matches the schema exactly.`,
	}
	return opts.schema.parse(await call([...opts.messages, correction]))
}
