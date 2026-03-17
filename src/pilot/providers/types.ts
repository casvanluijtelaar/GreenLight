export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
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
