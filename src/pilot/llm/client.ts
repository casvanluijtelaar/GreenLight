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

import type { Page } from "playwright"
import type { LLMProvider, ChatMessage, ProviderConfig } from "./provider.js"
import { resolveStep } from "./ops/resolve-step.js"
import { resolveStepWithPlanner } from "./ops/resolve-with-planner.js"
import { planSteps } from "./ops/plan-steps.js"
import { expandStep } from "./ops/expand-step.js"
import { evaluateCondition } from "./ops/evaluate-condition.js"
import type { Action, PlannedStep } from "./schemas/index.js"
import type { PageState } from "../../reporter/types.js"

export interface LLMClientConfig {
	apiKey: string
	provider: LLMProvider
	plannerModel: string
	pilotModel: string
}

export interface LLMClient {
	planSteps(steps: string[]): Promise<PlannedStep[]>
	evaluateCondition(condition: string, conditionType: string, pageState: PageState): Promise<boolean>
	resolveStep(step: string, pageState: PageState): Promise<Action>
	resolveStepWithPlanner(step: string, pageState: PageState): Promise<Action | null>
	expandStep(step: string, pageState: PageState, page: Page): Promise<PlannedStep[]>
	resetHistory(): void
}

/**
 * Assemble the per-op modules into the LLMClient surface that pilot.ts and
 * plan-runner.ts consume. Owns mutable conversation state (history, cache,
 * prevPageState, prevFormattedTree) and threads it through ops as explicit
 * dependencies.
 */
export function createLLMClient(config: LLMClientConfig): LLMClient {
	let history: ChatMessage[] = []
	let prevPageState: PageState | null = null
	let prevFormattedTree = ""
	const cache = new Map<string, Action>()

	const pilotConfig = (): ProviderConfig => ({ apiKey: config.apiKey, model: config.pilotModel })
	const plannerConfig = (): ProviderConfig => ({ apiKey: config.apiKey, model: config.plannerModel })

	return {
		resetHistory() {
			history = []
			prevPageState = null
			prevFormattedTree = ""
		},

		async planSteps(steps) {
			return planSteps(steps, { provider: config.provider, config: plannerConfig() })
		},

		async resolveStep(step, pageState) {
			const result = await resolveStep(step, pageState, {
				provider: config.provider,
				config: pilotConfig(),
				history, prevPageState, prevFormattedTree, cache,
			})
			history = result.newHistory
			prevPageState = result.newPrevPageState
			prevFormattedTree = result.newPrevFormattedTree
			return result.action
		},

		async resolveStepWithPlanner(step, pageState) {
			return resolveStepWithPlanner(step, pageState, {
				provider: config.provider,
				config: plannerConfig(),
				plannerModel: config.plannerModel,
				pilotModel: config.pilotModel,
			})
		},

		async expandStep(step, pageState, page) {
			const result = await expandStep(step, pageState, page, {
				provider: config.provider, config: plannerConfig(), history,
			})
			history = result.newHistory
			return result.steps
		},

		async evaluateCondition(condition, _conditionType, pageState) {
			const result = await evaluateCondition(condition, pageState, {
				provider: config.provider, config: pilotConfig(),
				history, prevPageState, prevFormattedTree,
			})
			history = result.newHistory
			prevPageState = result.newPrevPageState
			prevFormattedTree = result.newPrevFormattedTree
			return result.result
		},
	}
}
