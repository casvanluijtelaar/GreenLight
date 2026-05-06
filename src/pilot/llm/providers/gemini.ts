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

import type { GenerateRequest, LLMProvider } from "../provider.js"
import { LLMApiError } from "../provider.js"
import { callWithJsonSchema } from "./_helpers.js"

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"

/**
 * Native Google Gemini API provider. Sends the canonical Zod-derived JSON
 * Schema via `responseJsonSchema` (Nov 2025+) which accepts `anyOf`, `$ref`
 * and the rest of full JSON Schema, unlike the older `responseSchema` field.
 */
export function createGeminiProvider(baseUrlOverride?: string): LLMProvider {
	return {
		async generate<T>(req: GenerateRequest<T>): Promise<T> {
			return callWithJsonSchema(req, async (jsonSchema) => {
				const baseUrl = (baseUrlOverride ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
				const endpoint = `${baseUrl}/v1beta/models/${req.config.model}:generateContent?key=${req.config.apiKey}`

				const systemMessages = req.messages.filter((m) => m.role === "system")
				const conversationMessages = req.messages.filter((m) => m.role !== "system")

				const systemInstruction =
					systemMessages.length > 0
						? { parts: systemMessages.map((m) => ({ text: m.content })) }
						: undefined

				const contents = conversationMessages.map((m) => ({
					role: m.role === "assistant" ? "model" : m.role,
					parts: [{ text: m.content }],
				}))

				// Use `responseJsonSchema` (full JSON Schema) rather than the older
				// `responseSchema` (limited OpenAPI 3.0 subset). The schemas we send
				// include $ref / additionalProperties / definitions — all rejected by
				// `responseSchema` but accepted by `responseJsonSchema`.
				const body: Record<string, unknown> = {
					contents,
					generationConfig: {
						temperature: 0,
						responseMimeType: "application/json",
						responseJsonSchema: jsonSchema,
					},
				}
				if (systemInstruction) body.systemInstruction = systemInstruction

				const response = await fetch(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
				})

				if (!response.ok) {
					const respBody = await response.text()
					throw new LLMApiError(response.status, respBody)
				}

				const data = (await response.json()) as {
					candidates: { content: { parts: { text: string }[] } }[]
				}

				const text = data.candidates[0]?.content?.parts[0]?.text
				if (!text) {
					throw new Error("LLM returned empty response")
				}
				return JSON.parse(text)
			})
		},
	}
}
