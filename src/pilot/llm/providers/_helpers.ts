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
 * Internal helpers for passthrough providers (claude-api, claude-cli, gemini,
 * openrouter). Centralizes the Zod → JSON Schema conversion + post-validation
 * boilerplate so each provider only carries its own native API shaping.
 */

import { z } from "zod"
import type { GenerateRequest } from "../provider.js"

/**
 * Convert the Zod schema, hand the JSON Schema to the provider's native
 * sender, validate the response with the original Zod schema, return the
 * typed value. Validation failures throw `ZodError` so `complete<T>` can
 * retry with a correction message.
 */
export async function callWithJsonSchema<T>(
	req: GenerateRequest<T>,
	send: (jsonSchema: object) => Promise<unknown>,
): Promise<T> {
	// `io: "input"` emits the pre-`.transform()` shape (the wire shape the
	// provider sends to the LLM); the post-transform shape is the canonical
	// domain type we get back from `.parse()` below.
	// `unrepresentable: "any"` lets schemas with `.transform()` go through
	// without throwing — Zod walks the input side cleanly.
	const jsonSchema = z.toJSONSchema(req.schema, {
		target: "draft-7",
		io: "input",
		unrepresentable: "any",
	}) as object
	const raw = await send(jsonSchema)
	return req.schema.parse(raw)
}
