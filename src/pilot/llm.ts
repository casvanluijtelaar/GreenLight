/**
 * Provider-agnostic LLM client using the OpenAI-compatible chat completions API.
 * Default backend: OpenRouter. Works with any OpenAI-compatible endpoint.
 */

import type { RunConfig } from "../types.js"
import type { Action, PageState } from "../reporter/types.js"
import { formatA11yTree } from "./a11y-parser.js"
import { captureFormFields, formatFormFields } from "./form-fields.js"
import type { Page } from "playwright"
import { globals } from "../globals.js"

import { SYSTEM_PROMPT, PLAN_SYSTEM_PROMPT, EXPAND_SYSTEM_PROMPT } from "./prompts.js"
import { buildUserMessage, buildCompactMessage } from "./message-builder.js"
import { parseActionResponse, parsePlanResponse } from "./response-parser.js"
import type { PlannedStep } from "./response-parser.js"

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
	/**
	 * Pre-plan all steps by sending the full test spec to the LLM.
	 * The LLM interprets each step, potentially splitting compound steps
	 * into multiple atomic actions. Returns a flat list of planned steps.
	 */
	planSteps(steps: string[]): Promise<PlannedStep[]>
	/** Resolve a single step using the page state and a11y tree. */
	resolveStep(step: string, pageState: PageState): Promise<Action>
	/**
	 * Expand a compound step into multiple atomic actions using live page state.
	 * Used for steps like "fill in the form" that need to see the actual form
	 * fields before they can be decomposed into individual type/select/click actions.
	 */
	expandStep(
		step: string,
		pageState: PageState,
		page: Page,
	): Promise<PlannedStep[]>
	/** Reset conversation history (call between test cases). */
	resetHistory(): void
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
	let prevPageState: PageState | null = null
	let prevFormattedTree = ""

	async function chatCompletion(messages: ChatMessage[]): Promise<string> {
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

		return content
	}

	return {
		resetHistory() {
			history = []
			prevPageState = null
			prevFormattedTree = ""
		},

		async planSteps(steps: string[]): Promise<PlannedStep[]> {
			const userMessage = steps
				.map((s, i) => `${String(i + 1)}. ${s}`)
				.join("\n")

			const content = await chatCompletion([
				{ role: "system", content: PLAN_SYSTEM_PROMPT },
				{ role: "user", content: userMessage },
			])

			return parsePlanResponse(content)
		},

		async expandStep(
			step: string,
			pageState: PageState,
			page: Page,
		): Promise<PlannedStep[]> {
			const tree = formatA11yTree(pageState.a11yTree)
			const formFields = await captureFormFields(page)
			const formFieldsText = formatFormFields(formFields)

			if (globals.debug) {
				console.log(
					`\n      [expand] Detected ${String(formFields.length)} form fields:`,
				)
				for (const f of formFields) {
					const parts: string[] = [`        <${f.tag}>`]
					if (f.label) parts.push(`label="${f.label}"`)
					if (f.placeholder) parts.push(`placeholder="${f.placeholder}"`)
					parts.push(`type="${f.inputType}"`)
					if (f.required) parts.push("[required]")
					if (f.autocomplete) parts.push("[autocomplete]")
					if (f.options && f.options.length > 0) {
						parts.push(
							`options: [${f.options
								.slice(0, 5)
								.map((o) => `"${o}"`)
								.join(", ")}${f.options.length > 5 ? ", ..." : ""}]`,
						)
					}
					console.log(parts.join(" "))
				}
				const autoFields = formFields.filter((f) => f.autocomplete)
				if (autoFields.length > 0) {
					console.log(
						`      [expand] ${String(autoFields.length)} autocomplete field(s) detected`,
					)
				}
			}

			const userMessage = [
				`Original step: ${step}`,
				"",
				`Current URL: ${pageState.url}`,
				`Page title: ${pageState.title}`,
				"",
				"Accessibility tree:",
				tree,
				"",
				"Form fields on the page (with label, placeholder, type, and options):",
				formFieldsText,
			].join("\n")

			if (globals.debug) {
				console.log(`      [expand] Sending expansion request to LLM...`)
			}

			const content = await chatCompletion([
				{ role: "system", content: EXPAND_SYSTEM_PROMPT },
				{ role: "user", content: userMessage },
			])

			if (globals.debug) {
				console.log(`      [expand] LLM raw response:`)
				for (const line of content.trim().split("\n")) {
					console.log(`        ${line}`)
				}
			}

			const expanded = parsePlanResponse(content)

			if (globals.debug) {
				console.log(
					`      [expand] Parsed into ${String(expanded.length)} sub-steps:`,
				)
				for (const es of expanded) {
					const label = es.action ? JSON.stringify(es.action) : "(needs page)"
					console.log(`        - ${es.step} → ${label}`)
				}
			}

			// Add expansion exchange to history for context in subsequent steps
			history.push(
				{
					role: "user",
					content: `Expanded step: ${step}\nResult:\n${content}`,
				},
				{
					role: "assistant",
					content: "OK, form has been filled and submitted.",
				},
			)

			return expanded
		},

		async resolveStep(step: string, pageState: PageState): Promise<Action> {
			// Check cache: same step on same page → same action
			const cacheKey = `${step}\0${pageState.url}`
			const cached = cache.get(cacheKey)
			if (cached) return cached

			// Try to build a compact message if we have prior state.
			// Three modes:
			//   "unchanged" — page identical, skip tree + visible text
			//   "tree-only" — tree changed, skip visible text
			//   full — first step or after navigation
			let userMessage: string
			let compactMode = "full"
			if (prevPageState && history.length > 0) {
				const compact = buildCompactMessage(
					step,
					pageState,
					prevPageState,
					prevFormattedTree,
				)
				if (compact) {
					userMessage = compact.message
					compactMode = compact.mode
				} else {
					userMessage = buildUserMessage(step, pageState)
				}
			} else {
				userMessage = buildUserMessage(step, pageState)
			}

			if (globals.debug) {
				console.log(
					`      [resolve] Mode: ${compactMode} (${String(userMessage.length)} chars)`,
				)
			}

			// Build messages: system + history + new user message
			const messages: ChatMessage[] = [
				{ role: "system", content: SYSTEM_PROMPT },
				...history,
				{ role: "user", content: userMessage },
			]

			const content = await chatCompletion(messages)
			const action = parseActionResponse(content)

			// Cache the result for identical future requests
			cache.set(cacheKey, action)

			// Append this exchange to history for subsequent steps
			history.push(
				{ role: "user", content: userMessage },
				{ role: "assistant", content: content },
			)

			// Track page state for compact messages on subsequent steps
			prevPageState = pageState
			prevFormattedTree = formatA11yTree(pageState.a11yTree)

			return action
		},
	}
}
