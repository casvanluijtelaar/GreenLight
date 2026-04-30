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
 * Cross-cutting helpers that operate on a sequence of PlannedSteps:
 * ordering fixes and reference validation. Kept here (not in pilot.ts)
 * so the schema package owns the canonical traversal of the new
 * discriminated-union PlannedStep shape.
 */

import type { PlannedStep } from "./schemas/index.js"

/**
 * Read the variable name a step writes to, if any.
 * Atomic remember/count steps both carry `as` on the action variant.
 */
function getRememberTarget(step: PlannedStep): string | undefined {
	if (step.kind !== "atomic") return undefined
	const a = step.action
	if (a.action === "remember" || a.action === "count") return a.as
	return undefined
}

/**
 * Read the compare clause attached to a step, if any.
 * Lives on assert atomic actions.
 */
function getCompare(step: PlannedStep): { variable: string; literal?: string } | undefined {
	if (step.kind !== "atomic") return undefined
	const a = step.action
	if (a.action === "assert" && a.compare) return a.compare
	return undefined
}

/**
 * Fix plan ordering: when a REMEMBER is immediately followed by a COMPARE
 * that references the same variable, swap them so the COMPARE runs first
 * (against the previous baseline) and the REMEMBER captures the new value.
 * Without this fix, the COMPARE would always compare a value against itself.
 */
export function fixPlanOrdering(plan: PlannedStep[]): void {
	for (let i = 0; i < plan.length - 1; i++) {
		const stepRemembers = getRememberTarget(plan[i])
		if (!stepRemembers) continue

		const nextCompare = getCompare(plan[i + 1])
		if (!nextCompare) continue
		if (nextCompare.variable !== stepRemembers) continue

		// Swap them: COMPARE first, then REMEMBER
		const tmp = plan[i]
		plan[i] = plan[i + 1]
		plan[i + 1] = tmp
		// Skip the swapped pair to avoid infinite loop
		i++
	}
}

/**
 * Validate that every COMPARE in the plan references a REMEMBER that
 * appears earlier. Returns an array of error messages (empty if valid).
 */
export function validatePlanReferences(plan: PlannedStep[]): string[] {
	const errors: string[] = []
	const remembered = new Set<string>()

	for (const step of plan) {
		const target = getRememberTarget(step)
		if (target) remembered.add(target)

		const compare = getCompare(step)
		if (compare && compare.literal === undefined) {
			if (!remembered.has(compare.variable)) {
				errors.push(
					`COMPARE references "${compare.variable}" but no REMEMBER "${compare.variable}" appears before it`,
				)
			}
		}
	}

	return errors
}
