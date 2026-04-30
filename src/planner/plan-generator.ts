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

/**
 * Plan recorder — hooks into the Pilot loop during a discovery run
 * to capture concrete actions and produce a HeuristicPlan.
 */

import type { Action, ExecutionResult, PlannedStep } from "../reporter/types.js"
import type { HeuristicPlan, HeuristicStep } from "./plan-types.js"
import type { Condition } from "../pilot/conditions.js"

/**
 * Synthetic action shape recorded for non-Action plan markers like
 * datepick or map_detect. These don't go through the executor — the
 * recorder stores them so cached replay can re-trigger the same logic.
 */
export interface SyntheticAction {
	action: "datepick" | "map_detect"
	value?: string
	option?: string
}

/** What the recorder accepts for `action`: either a real Action or a synthetic marker. */
export type RecordedAction = Action | SyntheticAction

/** Records concrete actions during a discovery run. */
export interface PlanRecorder {
	/** Record a successful step execution. */
	recordStep(
		step: string,
		action: RecordedAction,
		result: ExecutionResult,
		postState: { url: string; title: string },
	): void
	/** Record a conditional step evaluation. */
	recordConditionalStep(
		step: string,
		condition: Condition,
		conditionMet: boolean,
		branch: PlannedStep[] | undefined,
	): void
	/** Produce the final heuristic plan from all recorded steps. */
	finalize(): HeuristicPlan
	/** Produce a partial plan (from a failed run) with the remaining input steps to resume. */
	finalizePartial(remainingSteps: string[]): HeuristicPlan
}

/**
 * Create a plan recorder for a single test case.
 * Call recordStep() after each successful step during the discovery run.
 * Call finalize() after the test passes to get the cached plan.
 */
export function createPlanRecorder(
	suiteSlug: string,
	testSlug: string,
	sourceHash: string,
	model: string,
): PlanRecorder {
	const steps: HeuristicStep[] = []

	return {
		recordStep(step, action, result, postState) {
			const hStep: HeuristicStep = {
				originalStep: step,
				action: action.action,
				postStepFingerprint: {
					url: postState.url,
					title: postState.title,
				},
			}

			// Store the resolved selector (role+name or CSS) if available
			if (result.resolvedSelector) {
				hStep.selector = { ...result.resolvedSelector }
			}

			// Read variant-specific fields safely from the discriminated union.
			// Each lookup is an `in` check so we don't hit "property does not
			// exist on variant X" type errors.
			if ("value" in action && action.value !== undefined) {
				hStep.value = action.value
			}

			if ("testid" in action && action.testid !== undefined) {
				hStep.testid = action.testid
			}

			if ("option" in action && action.option !== undefined) {
				hStep.option = action.option
			}

			// `as` lives on remember/count variants in the new schema
			if ("as" in action && action.as !== undefined) {
				hStep.rememberAs = action.as
			}

			if ("compare" in action && action.compare) {
				hStep.compare = { ...action.compare }
			}

			if ("assertion" in action && action.assertion) {
				hStep.assertion = { ...action.assertion }
			}

			steps.push(hStep)
		},

		recordConditionalStep(step, condition, conditionMet, _branch) {
			const branchLabel = conditionMet ? "then" : (_branch ? "else" : "skipped")
			const hStep: HeuristicStep = {
				originalStep: step,
				action: "conditional",
				condition: { type: condition.type, target: condition.target },
				discoveryBranch: branchLabel as "then" | "else" | "skipped",
				postStepFingerprint: { url: "", title: "" },
			}
			// Note: the branch sub-steps will be recorded individually as they
			// execute — they are spliced into the queue and go through recordStep().
			steps.push(hStep)
		},

		finalize() {
			return {
				suiteSlug,
				testSlug,
				sourceHash,
				model,
				generatedAt: new Date().toISOString(),
				greenlightVersion: "0.1.0",
				steps,
			}
		},

		finalizePartial(remainingSteps: string[]) {
			return {
				suiteSlug,
				testSlug,
				sourceHash,
				model,
				generatedAt: new Date().toISOString(),
				greenlightVersion: "0.1.0",
				steps,
				partial: true,
				remainingSteps,
			}
		},
	}
}
