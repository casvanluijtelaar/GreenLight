/**
 * The Pilot — core AI agent loop.
 * Iterates through test steps: capture state → LLM → execute → record result.
 */

import type { Page } from "playwright"
import type {
	Action,
	StepResult,
	StepTiming,
	TestCaseResult,
} from "../reporter/types.js"
import type { LLMClient } from "./llm.js"
import { capturePageState, resetRefCounter, formatA11yTree } from "./state.js"
import { executeAction } from "./executor.js"
import type { ConsoleEntry } from "../reporter/types.js"

export interface PilotOptions {
	/** Per-step timeout in ms. */
	timeout: number
	/** Console log drain function. */
	consoleDrain: () => ConsoleEntry[]
	/** Whether to print debug output. */
	debug: boolean
}

/**
 * Run all steps of a test case sequentially.
 * Fails fast: stops on the first failed step.
 */
export async function runTestCase(
	page: Page,
	testCase: { name: string; steps: string[] },
	llm: LLMClient,
	options: PilotOptions,
): Promise<TestCaseResult> {
	const startTime = performance.now()
	const stepResults: StepResult[] = []

	// Fresh conversation history for each test case
	llm.resetHistory()

	for (const step of testCase.steps) {
		const stepStart = performance.now()
		let action: Action | null = null
		const timing: StepTiming = {
			capture: 0,
			llm: 0,
			execute: 0,
			postCapture: 0,
		}

		try {
			// Capture current page state
			let t0 = performance.now()
			resetRefCounter()
			const state = await capturePageState(page, options.consoleDrain)
			timing.capture = performance.now() - t0

			if (options.debug) {
				console.log(`\n      A11y tree:\n`)
				console.log(formatA11yTree(state.a11yTree))
			}

			// Ask LLM to resolve the step
			t0 = performance.now()
			action = await llm.resolveStep(step, state)
			timing.llm = performance.now() - t0

			if (options.debug) {
				console.log(`      LLM action: ${JSON.stringify(action)}`)
			}

			// Execute the action
			t0 = performance.now()
			const result = await executeAction(page, action, state.a11yTree)
			timing.execute = performance.now() - t0

			if (!result.success) {
				stepResults.push({
					step,
					action,
					status: "failed",
					duration: performance.now() - stepStart,
					timing,
					error: result.error,
				})
				break
			}

			// Capture post-action screenshot for reporting
			// Retry once if the page is mid-navigation
			t0 = performance.now()
			let postState
			try {
				postState = await capturePageState(page, options.consoleDrain)
			} catch {
				await page.waitForLoadState("domcontentloaded")
				postState = await capturePageState(page, options.consoleDrain)
			}
			timing.postCapture = performance.now() - t0

			stepResults.push({
				step,
				action,
				status: "passed",
				duration: performance.now() - stepStart,
				timing,
				screenshot: postState.screenshot,
			})
		} catch (err) {
			stepResults.push({
				step,
				action,
				status: "failed",
				duration: performance.now() - stepStart,
				timing,
				error: err instanceof Error ? err.message : String(err),
			})
			break
		}
	}

	const allPassed = stepResults.every((s) => s.status === "passed")
	const status =
		allPassed && stepResults.length === testCase.steps.length
			? "passed"
			: "failed"

	return {
		name: testCase.name,
		status,
		steps: stepResults,
		duration: performance.now() - startTime,
	}
}
