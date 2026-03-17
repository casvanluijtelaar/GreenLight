import { type ChatMessage, type LLMProvider, type ProviderConfig, LLMApiError } from "./types.js"

/**
 * OpenAI-compatible chat completions provider.
 * Works with OpenRouter, OpenAI, and any API that follows the same format.
 */
export function createOpenAICompatibleProvider(baseUrl: string): LLMProvider {
	const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`

	return {
		async chatCompletion(
			messages: ChatMessage[],
			config: ProviderConfig,
		): Promise<string> {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${config.apiKey}`,
				},
				body: JSON.stringify({
					model: config.model,
					messages,
					temperature: 0,
				}),
			})

			if (!response.ok) {
				const body = await response.text()
				throw new LLMApiError(response.status, body)
			}

			const data = (await response.json()) as {
				choices: { message: { content: string } }[]
			}

			const content = data.choices[0]?.message?.content
			if (!content) {
				throw new Error("LLM returned empty response")
			}

			return content
		},
	}
}
