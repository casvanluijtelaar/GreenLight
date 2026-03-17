export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

/**
 * Thrown when the LLM API returns a 4xx or 5xx error.
 * The run loop should catch this and abort the entire test run
 * rather than continuing to the next step or test case.
 */
export class LLMApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message)
		this.name = "LLMApiError"
	}
}

export interface ProviderConfig {
	apiKey: string
	model: string
}

export interface LLMProvider {
	chatCompletion(
		messages: ChatMessage[],
		config: ProviderConfig,
	): Promise<string>
}
