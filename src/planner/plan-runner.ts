/**
 * Replays a cached heuristic plan directly via Playwright — no LLM calls.
 * For actions with stored selectors (click, type, select), builds locators
 * from the selector. For other actions, delegates to the regular executor.
 */

import type { Page } from "playwright"
import type { Action, StepResult, TestCaseResult } from "../reporter/types.js"
import type { HeuristicPlan, HeuristicSelector, HeuristicStep } from "./plan-types.js"
import { executeAction, runWithNavigationHandling } from "../pilot/executor.js"

type AriaRole = Parameters<Page["getByRole"]>[0]

/** Build a Playwright locator from a stored heuristic selector. */
function buildLocator(page: Page, selector: HeuristicSelector) {
	if (selector.css) {
		return page.locator(selector.css)
	}
	if (selector.role) {
		const role = selector.role as AriaRole
		return selector.name
			? page.getByRole(role, { name: selector.name })
			: page.getByRole(role)
	}
	throw new Error("Heuristic selector has neither role nor css")
}

/**
 * Execute a single heuristic step.
 * Actions with selectors (click, type, select) use stored selectors directly.
 * Other actions delegate to the regular executor.
 */
async function executeHeuristicStep(
	page: Page,
	step: HeuristicStep,
): Promise<{ success: boolean; duration: number; error?: string }> {
	const start = performance.now()

	try {
		switch (step.action) {
			case "click": {
				const locator = buildLocator(page, step.selector!)
				await runWithNavigationHandling(page, () => locator.click())
				break
			}

			case "type": {
				if (!step.value) throw new Error("type step requires a value")
				const locator = buildLocator(page, step.selector!)
				await locator.fill(step.value)
				break
			}

			case "select": {
				if (!step.value) throw new Error("select step requires a value")
				const locator = buildLocator(page, step.selector!)
				await locator.selectOption({ label: step.value })
				break
			}

			case "scroll": {
				if (step.selector) {
					const locator = buildLocator(page, step.selector)
					await locator.scrollIntoViewIfNeeded()
				} else {
					const delta = step.value === "up" ? -500 : 500
					await page.mouse.wheel(0, delta)
				}
				break
			}

			default: {
				// navigate, press, wait, assert → delegate to regular executor
				const action: Action = {
					action: step.action,
					value: step.value,
					assertion: step.assertion,
				}
				const result = await executeAction(page, action, [])
				return {
					success: result.success,
					duration: performance.now() - start,
					error: result.error,
				}
			}
		}

		return { success: true, duration: performance.now() - start }
	} catch (err) {
		return {
			success: false,
			duration: performance.now() - start,
			error: err instanceof Error ? err.message : String(err),
		}
	}
}

/** Check if a URL path drift occurred (ignoring query params). */
function hasPathDrift(expectedUrl: string, actualUrl: string): boolean {
	try {
		const expectedPath = new URL(expectedUrl).pathname
		const actualPath = new URL(actualUrl).pathname
		return expectedPath !== actualPath
	} catch {
		// If URL parsing fails, compare as strings
		return expectedUrl !== actualUrl
	}
}

/**
 * Replay a cached heuristic plan against the browser.
 * Returns a TestCaseResult with mode "cached" and a drifted flag.
 */
export async function runCachedPlan(
	page: Page,
	plan: HeuristicPlan,
	testName: string,
	options?: { waitForNetworkIdle?: () => Promise<void> },
): Promise<TestCaseResult> {
	const startTime = performance.now()
	const stepResults: StepResult[] = []
	let drifted = false

	for (const step of plan.steps) {
		const stepStart = performance.now()

		// Wait for async content to settle before interacting
		if (options?.waitForNetworkIdle) {
			await options.waitForNetworkIdle()
		}

		const result = await executeHeuristicStep(page, step)

		if (!result.success) {
			drifted = true
			stepResults.push({
				step: step.originalStep,
				action: {
					action: step.action,
					value: step.value,
					assertion: step.assertion,
				},
				status: "failed",
				duration: performance.now() - stepStart,
				error: `Plan drift: ${result.error}`,
			})
			break
		}

		// Check URL path fingerprint for drift
		const currentUrl = page.url()
		if (hasPathDrift(step.postStepFingerprint.url, currentUrl)) {
			drifted = true
			stepResults.push({
				step: step.originalStep,
				action: {
					action: step.action,
					value: step.value,
					assertion: step.assertion,
				},
				status: "failed",
				duration: performance.now() - stepStart,
				error: `Plan drift: expected URL path "${new URL(step.postStepFingerprint.url).pathname}" but got "${new URL(currentUrl).pathname}"`,
			})
			break
		}

		// Capture post-action screenshot for reporting
		let screenshot: string | undefined
		try {
			const buf = await page.screenshot({ type: "png" })
			screenshot = buf.toString("base64")
		} catch {
			// Screenshot failed — continue without it
		}

		stepResults.push({
			step: step.originalStep,
			action: {
				action: step.action,
				value: step.value,
				assertion: step.assertion,
			},
			status: "passed",
			duration: performance.now() - stepStart,
			screenshot,
		})
	}

	const allPassed = stepResults.every((s) => s.status === "passed")
	const status =
		allPassed && stepResults.length === plan.steps.length
			? "passed"
			: "failed"

	return {
		name: testName,
		status,
		steps: stepResults,
		duration: performance.now() - startTime,
		mode: "cached",
		drifted,
	}
}
