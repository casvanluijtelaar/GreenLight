import { type ChatMessage, type LLMProvider, type ProviderConfig, LLMApiError } from "./types.js"

/**
 * Native Anthropic Messages API provider.
 */
export function createAnthropicProvider(baseUrl: string): LLMProvider {
	const endpoint = `${baseUrl.replace(/\/+$/, "")}/v1/messages`

	return {
		async chatCompletion(
			messages: ChatMessage[],
			config: ProviderConfig,
		): Promise<string> {
			// Extract system message into separate field
			const systemMessages = messages.filter((m) => m.role === "system")
			const nonSystemMessages = messages.filter(
				(m) => m.role !== "system",
			)
			const systemText = systemMessages
				.map((m) => m.content)
				.join("\n\n")

			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": config.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: config.model,
					max_tokens: 4096,
					temperature: 0,
					...(systemText ? { system: systemText } : {}),
					messages: nonSystemMessages.map((m) => ({
						role: m.role,
						content: m.content,
					})),
				}),
			})

			if (!response.ok) {
				const body = await response.text()
				throw new LLMApiError(response.status, body)
			}

			const data = (await response.json()) as {
				content: { type: string; text: string }[]
			}

			const content = data.content[0]?.text
			if (!content) {
				throw new Error("LLM returned empty response")
			}

			return content
		},
	}
}
