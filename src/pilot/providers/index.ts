import type { Provider } from "../../types.js"
import type { LLMProvider } from "./types.js"
import { createOpenAICompatibleProvider } from "./openai-compatible.js"
import { createAnthropicProvider } from "./anthropic.js"
import { createGeminiProvider } from "./gemini.js"

export type { ChatMessage, ProviderConfig, LLMProvider } from "./types.js"
export { LLMApiError } from "./types.js"

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
		case "claude":
			return createAnthropicProvider(
				baseUrlOverride ?? "https://api.anthropic.com",
			)
		case "gemini":
			return createGeminiProvider(baseUrlOverride)
		default: {
			const _exhaustive: never = name
			throw new Error(`Unknown provider: ${String(_exhaustive)}`)
		}
	}
}
