/**
 * Provider-agnostic LLM client using the OpenAI-compatible chat completions API.
 * Default backend: OpenRouter. Works with any OpenAI-compatible endpoint.
 */

import type { RunConfig } from "../types.js"
import type { Action, PageState } from "../reporter/types.js"
import { formatA11yTree } from "./state.js"

/** Configuration for the LLM client. */
export interface LLMClientConfig {
	apiKey: string
	baseUrl: string
	model: string
}

/** A chat message in the OpenAI format. */
export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

/** The LLM client interface. */
export interface LLMClient {
	resolveStep(step: string, pageState: PageState): Promise<Action>
	/** Reset conversation history (call between test cases). */
	resetHistory(): void
}

/** System prompt that defines the Pilot's persona and expected response format. */
export const SYSTEM_PROMPT = `You are The Pilot, an AI agent that executes end-to-end tests in a web browser.

You receive a plain-English test step and the current page state (an accessibility tree with element refs).

Your job is to determine the SINGLE browser action needed to execute the step.

Available actions:
- click: Click an element. Requires "ref".
- type: Type text into an input. Requires "ref" and "value".
- select: Select an option from a dropdown. Requires "ref" and "value" (the option label).
- scroll: Scroll the page. Requires "value" ("up" or "down"). Optional "ref" to scroll a specific element.
- navigate: Navigate to a URL. Requires "value" (the URL or path).
- press: Press a keyboard key. Requires "value" (key name, e.g. "Enter", "Tab", "Escape").
- wait: Wait for a condition. Requires "value" (description of what to wait for).
- assert: Check a condition on the page. Requires "assertion" with "type" and "expected".
  Assertion types: "contains_text", "not_contains_text", "url_contains", "element_visible", "element_not_visible", "link_exists".

Respond with ONLY a JSON object. No markdown, no explanation. Example responses:

{"action":"click","ref":"e5"}
{"action":"type","ref":"e3","value":"jane@example.com"}
{"action":"select","ref":"e8","value":"Canada"}
{"action":"navigate","value":"/products"}
{"action":"press","value":"Enter"}
{"action":"assert","assertion":{"type":"contains_text","expected":"Welcome back"}}
{"action":"scroll","value":"down"}
`

// ── Step patterns that can be resolved without an LLM call ──────────

const STEP_PATTERNS: {
	pattern: RegExp
	toAction: (m: RegExpMatchArray) => Action
}[] = [
	{
		pattern: /^check that (?:the )?page contains "([^"]+)"$/i,
		toAction: (m) => ({
			action: "assert",
			assertion: { type: "contains_text", expected: m[1] },
		}),
	},
	{
		pattern: /^check that (?:the )?page does not contain "([^"]+)"$/i,
		toAction: (m) => ({
			action: "assert",
			assertion: { type: "not_contains_text", expected: m[1] },
		}),
	},
	{
		pattern: /^check that (?:the )?URL contains "([^"]+)"$/i,
		toAction: (m) => ({
			action: "assert",
			assertion: { type: "url_contains", expected: m[1] },
		}),
	},
	{
		pattern: /^check that there is a link to ([^\s"]+|"[^"]+")$/i,
		toAction: (m) => ({
			action: "assert",
			assertion: {
				type: "link_exists",
				expected: m[1].replace(/^"|"$/g, ""),
			},
		}),
	},
	{
		pattern: /^press (\w+)$/i,
		toAction: (m) => ({ action: "press", value: m[1] }),
	},
	{
		pattern: /^go to "([^"]+)"$/i,
		toAction: (m) => ({ action: "navigate", value: m[1] }),
	},
	{
		pattern: /^scroll (up|down)$/i,
		toAction: (m) => ({ action: "scroll", value: m[1].toLowerCase() }),
	},
]

/**
 * Try to resolve a step from its text alone, without calling the LLM.
 * Returns the Action if matched, or undefined if the LLM is needed.
 */
export function tryParseStep(step: string): Action | undefined {
	for (const { pattern, toAction } of STEP_PATTERNS) {
		const match = pattern.exec(step)
		if (match) return toAction(match)
	}
	return undefined
}

// ── Message construction ────────────────────────────────────────────

/** Build the user message containing the step and page state. */
export function buildUserMessage(step: string, pageState: PageState): string {
	const tree = formatA11yTree(pageState.a11yTree)
	return [
		`Current URL: ${pageState.url}`,
		`Page title: ${pageState.title}`,
		"",
		"Accessibility tree:",
		tree,
		"",
		`Step to execute: ${step}`,
	].join("\n")
}

/** Build the full messages array for a chat completion request. */
export function buildMessages(
	step: string,
	pageState: PageState,
): ChatMessage[] {
	return [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: buildUserMessage(step, pageState) },
	]
}

/** Parse a JSON string from the LLM into a validated Action. */
export function parseActionResponse(raw: string): Action {
	// Strip markdown code fences if the LLM wraps in ```json
	let cleaned = raw.trim()
	if (cleaned.startsWith("```")) {
		cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "")
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(cleaned)
	} catch {
		throw new Error(`LLM returned invalid JSON: ${raw}`)
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`LLM returned non-object JSON: ${raw}`)
	}

	const obj = parsed as Record<string, unknown>

	if (typeof obj.action !== "string" || obj.action.length === 0) {
		throw new Error(`LLM response missing "action" field: ${raw}`)
	}

	const VALID_ACTIONS = [
		"click",
		"type",
		"select",
		"scroll",
		"navigate",
		"press",
		"wait",
		"assert",
	]

	if (!VALID_ACTIONS.includes(obj.action)) {
		throw new Error(
			`LLM returned unknown action "${obj.action}". Valid: ${VALID_ACTIONS.join(", ")}`,
		)
	}

	const action: Action = { action: obj.action }

	if (typeof obj.ref === "string") {
		action.ref = obj.ref
	}
	if (typeof obj.value === "string") {
		action.value = obj.value
	}
	if (typeof obj.assertion === "object" && obj.assertion !== null) {
		const a = obj.assertion as Record<string, unknown>
		if (typeof a.type === "string" && typeof a.expected === "string") {
			action.assertion = { type: a.type, expected: a.expected }
		}
	}

	return action
}

/** Resolve the API key from environment variables. */
export function resolveApiKey(): string {
	const key = process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY
	if (!key) {
		throw new Error(
			"No API key found. Set OPENROUTER_API_KEY or LLM_API_KEY environment variable.",
		)
	}
	return key
}

/** Resolve LLM client config from RunConfig and environment. */
export function resolveLLMConfig(runConfig: RunConfig): LLMClientConfig {
	return {
		apiKey: resolveApiKey(),
		baseUrl: runConfig.llmBaseUrl,
		model: runConfig.model,
	}
}

/**
 * Create an LLM client that maintains conversation history within a test case.
 * The system prompt is sent once. Each step adds a user message and the LLM's
 * response to the history, giving the model context about prior actions.
 * Call resetHistory() between test cases.
 */
export function createLLMClient(config: LLMClientConfig): LLMClient {
	const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`
	let history: ChatMessage[] = []
	const cache = new Map<string, Action>()

	return {
		resetHistory() {
			history = []
		},

		async resolveStep(step: string, pageState: PageState): Promise<Action> {
			// Try to resolve without the LLM first
			const parsed = tryParseStep(step)
			if (parsed) return parsed

			// Check cache: same step on same page state → same action
			const cacheKey = `${step}\0${pageState.url}`
			const cached = cache.get(cacheKey)
			if (cached) return cached

			const userMessage = buildUserMessage(step, pageState)

			// Build messages: system + history + new user message
			const messages: ChatMessage[] = [
				{ role: "system", content: SYSTEM_PROMPT },
				...history,
				{ role: "user", content: userMessage },
			]

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
				throw new Error(`LLM API error ${String(response.status)}: ${body}`)
			}

			const data = (await response.json()) as {
				choices: { message: { content: string } }[]
			}

			const content = data.choices[0]?.message?.content
			if (!content) {
				throw new Error("LLM returned empty response")
			}

			const action = parseActionResponse(content)

			// Cache the result for identical future requests
			cache.set(cacheKey, action)

			// Append this exchange to history for subsequent steps
			history.push(
				{ role: "user", content: userMessage },
				{ role: "assistant", content: content },
			)

			return action
		},
	}
}
