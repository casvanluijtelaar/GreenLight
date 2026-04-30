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

import type { ChatMessage } from "./provider.js"

/** Approximate token count from character length. Existing code uses 4 chars per token. */
const CHARS_PER_TOKEN = 4
const TOKEN_BUDGET = 100_000

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Drop the oldest user/assistant pairs from history until the total token
 * estimate (system + user message + history) fits within TOKEN_BUDGET.
 *
 * Pulled out of llm.ts::resolveStep so each op can use the same logic.
 * Returns a new array when pruning happens; otherwise returns the input
 * array unchanged (caller can rely on referential equality).
 */
export function pruneHistory(opts: {
	systemPrompt: string
	userMessage: string
	history: ChatMessage[]
}): { history: ChatMessage[]; tokens: number } {
	const systemTokens = estimateTokens(opts.systemPrompt)
	const userTokens = estimateTokens(opts.userMessage)
	let totalTokens = systemTokens + userTokens
	for (const msg of opts.history) totalTokens += estimateTokens(msg.content)

	if (totalTokens <= TOKEN_BUDGET) return { history: opts.history, tokens: totalTokens }

	const pruned = [...opts.history]
	while (pruned.length >= 2 && totalTokens > TOKEN_BUDGET) {
		const a = pruned.shift()!
		const b = pruned.shift()!
		totalTokens -= estimateTokens(a.content)
		totalTokens -= estimateTokens(b.content)
	}
	return { history: pruned, tokens: totalTokens }
}
