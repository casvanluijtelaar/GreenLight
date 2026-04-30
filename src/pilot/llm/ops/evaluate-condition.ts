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

import type { ChatMessage, LLMProvider, ProviderConfig } from "../provider.js"
import { complete } from "../complete.js"
import {
	evaluateConditionResponseSchema,
	EVALUATE_CONDITION_SCHEMA_NAME,
} from "../schemas/index.js"
import { SYSTEM_PROMPT } from "./resolve-step.js"
import { buildUserMessage, buildCompactMessage } from "../../message-builder.js"
import { formatA11yTree } from "../../a11y-parser.js"
import type { PageState } from "../../../reporter/types.js"

export interface EvaluateConditionDeps {
	provider: LLMProvider
	config: ProviderConfig
	history: ChatMessage[]
	prevPageState: PageState | null
	prevFormattedTree: string
}

export interface EvaluateConditionResult {
	result: boolean
	newHistory: ChatMessage[]
	newPrevPageState: PageState
	newPrevFormattedTree: string
}

/**
 * Ask the LLM whether a condition is met against the live page state.
 * Frame the question as a "find a matching prominent element" task and let
 * the LLM return a boolean directly. Participates in the conversation
 * history so subsequent steps share context.
 */
export async function evaluateCondition(
	condition: string,
	pageState: PageState,
	deps: EvaluateConditionDeps,
): Promise<EvaluateConditionResult> {
	const wrappedQuestion = `check if there is a visible, prominent element matching "${condition}" on the page: a button, link, input, or heading that a user would see and interact with. Ignore hidden "skip to content" links and other accessibility-only elements. Partial name matching is OK. Respond with result: true if such an element exists; result: false otherwise.`

	let userMessage: string
	if (deps.prevPageState && deps.history.length > 0) {
		const compact = buildCompactMessage(wrappedQuestion, pageState, deps.prevPageState, deps.prevFormattedTree)
		userMessage = compact ? compact.message : buildUserMessage(wrappedQuestion, pageState)
	} else {
		userMessage = buildUserMessage(wrappedQuestion, pageState)
	}

	const response = await complete({
		provider: deps.provider,
		config: deps.config,
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			...deps.history,
			{ role: "user", content: userMessage },
		],
		schema: evaluateConditionResponseSchema,
		schemaName: EVALUATE_CONDITION_SCHEMA_NAME,
	})

	return {
		result: response.result,
		newHistory: [
			...deps.history,
			{ role: "user", content: userMessage },
			{ role: "assistant", content: JSON.stringify(response) },
		],
		newPrevPageState: pageState,
		newPrevFormattedTree: formatA11yTree(pageState.a11yTree),
	}
}
