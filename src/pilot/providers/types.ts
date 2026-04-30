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

import type { GenerateRequest } from "../llm/provider.js"

export interface ChatMessage {
	role: "system" | "user" | "assistant"
	content: string
}

/**
 * Re-export of the canonical LLMApiError from the new llm/ subsystem so
 * `instanceof` checks remain consistent across the migration. The original
 * class lived here; during Phase B the canonical definition is in
 * src/pilot/llm/provider.ts. This re-export will be removed in Phase E
 * along with the rest of this file.
 */
export { LLMApiError } from "../llm/provider.js"

export interface ProviderConfig {
	apiKey: string
	model: string
}

export interface LLMProvider {
	chatCompletion(
		messages: ChatMessage[],
		config: ProviderConfig,
	): Promise<string>
	/**
	 * Schema-aware generation. Filled in per-provider during Phase B.
	 * During migration, providers that haven't been migrated yet throw
	 * "generate not implemented" so any accidental wiring fails loudly.
	 */
	generate(req: GenerateRequest): Promise<unknown>
}
