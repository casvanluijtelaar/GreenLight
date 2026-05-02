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

import type { Provider } from "../../../types.js"
import type { LLMProvider } from "../provider.js"
import { createOpenAICompatibleProvider } from "./openai-compatible.js"
import { createClaudeApiProvider } from "./claude-api.js"
import { createGeminiProvider } from "./gemini.js"
import { createClaudeCliProvider } from "./claude-cli.js"

export type { ChatMessage, LLMProvider, ProviderConfig, GenerateRequest } from "../provider.js"
export { LLMApiError } from "../provider.js"

/**
 * Factory: create an LLMProvider by name.
 * @param name - The provider identifier.
 * @param baseUrlOverride - Optional override for the provider's base URL.
 */
export function createProvider(
	name: Provider,
	baseUrlOverride?: string,
): LLMProvider {
	switch (name) {
		case "openrouter":
			return createOpenAICompatibleProvider(
				baseUrlOverride ?? "https://openrouter.ai/api/v1",
			)
		case "openai":
			return createOpenAICompatibleProvider(
				baseUrlOverride ?? "https://api.openai.com/v1",
			)
		case "claude-api":
			return createClaudeApiProvider(
				baseUrlOverride ?? "https://api.anthropic.com",
			)
		case "claude-cli":
			return createClaudeCliProvider()
		case "gemini":
			return createGeminiProvider(baseUrlOverride)
		default: {
			const _exhaustive: never = name
			throw new Error(`Unknown provider: ${String(_exhaustive)}`)
		}
	}
}
