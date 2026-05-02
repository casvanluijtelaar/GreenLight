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
import { type Action } from "../schemas/index.js"
import {
	SYSTEM_PROMPT,
	resolveStepResponseSchema,
	RESOLVE_STEP_SCHEMA_NAME,
} from "./resolve-step.js"
import { buildUserMessage } from "../../message-builder.js"
import type { PageState } from "../../../reporter/types.js"

export interface ResolveWithPlannerDeps {
	provider: LLMProvider
	config: ProviderConfig          // planner-model config
	plannerModel: string
	pilotModel: string
}

/**
 * One-shot fallback: re-runs the resolve-step prompt against the planner model
 * (no history). Returns null when the planner and pilot are configured to the
 * same model (no point retrying the same way).
 */
export async function resolveStepWithPlanner(
	step: string,
	pageState: PageState,
	deps: ResolveWithPlannerDeps,
): Promise<Action | null> {
	if (deps.plannerModel === deps.pilotModel) return null

	const userMessage = buildUserMessage(step, pageState)
	const messages: ChatMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: userMessage },
	]

	const response = await complete({
		provider: deps.provider,
		config: deps.config,
		messages,
		schema: resolveStepResponseSchema,
		schemaName: RESOLVE_STEP_SCHEMA_NAME,
	})

	return response.action
}
