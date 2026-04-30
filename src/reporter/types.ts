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
 * Shared result and state types used across the Pilot, Runner, and Reporters.
 */

import type { Action } from "../pilot/llm/schemas/index.js"

/** An annotated node from the accessibility tree with a stable element ref. */
export interface A11yNode {
	ref: string
	role: string
	name: string
	level?: number
	url?: string
	children?: A11yNode[]
	raw: string
	/** Visible innerText of this element (when different from the a11y name). */
	visibleText?: string
	/** Placeholder attribute value (for inputs). */
	placeholder?: string
	/** Current input value or selected option text. */
	value?: string
}

/** Snapshot of an interactive map's viewport state. */
export interface MapState {
	/** Which adapter produced this state (e.g. "maplibre", "leaflet", "mapbox"). */
	adapter: string
	/** Map center coordinate. */
	center: { lng: number; lat: number }
	/** Current zoom level. */
	zoom: number
	/** Camera bearing in degrees (0 = north). */
	bearing: number
	/** Camera pitch in degrees (0 = straight down). */
	pitch: number
	/** Visible bounds of the viewport. */
	bounds: { sw: { lng: number; lat: number }; ne: { lng: number; lat: number } }
	/** IDs of all layers in the current style. */
	layers: string[]
	/** Whether the map style is fully loaded. */
	styleLoaded: boolean
}

/** Complete page state captured at a point in time. */
export interface PageState {
	/** Accessibility tree snapshot with element refs assigned. */
	a11yTree: A11yNode[]
	/** Raw aria snapshot text from Playwright. */
	a11yRaw: string
	/** All visible text on the page (document.body.innerText). */
	visibleText?: string
	/** Base64-encoded PNG screenshot of the viewport (only on post-action captures). */
	screenshot?: string
	/** Current page URL. */
	url: string
	/** Current page title. */
	title: string
	/** Console messages since last capture. */
	consoleLogs: ConsoleEntry[]
	/** Map viewport state, if a supported map library was detected. */
	mapState?: MapState
}

/** A single browser console message. */
export interface ConsoleEntry {
	type: string
	text: string
}

/** How an element was resolved — stored in heuristic plans for cached replay. */
export interface ResolvedSelector {
	/** ARIA role from the a11y tree (for ref-based resolution). */
	role?: string
	/** Accessible name from the a11y tree. */
	name?: string
	/** CSS DOM selector extracted from the element (for text-based fallback). */
	css?: string
	/** Zero-based index when multiple elements match the same role+name. */
	nth?: number
}

/** Result of executing a single action in the browser. */
export interface ExecutionResult {
	/** Whether the action completed successfully. */
	success: boolean
	/** Duration in milliseconds. */
	duration: number
	/** Error message if the action failed. */
	error?: string
	/** Selector info for the element that was acted upon (used by plan recorder). */
	resolvedSelector?: ResolvedSelector
	/** For remember actions: the captured value. */
	rememberedValue?: string
}

/** Per-phase timing breakdown for a step. */
export interface StepTiming {
	/** Time to capture page state (a11y tree + screenshot) in ms. */
	capture: number
	/** Time for the LLM to return an action in ms. */
	llm: number
	/** Time to execute the action in the browser in ms. */
	execute: number
	/** Time to capture post-action state in ms. */
	postCapture: number
	/** Time waiting for network requests to complete before the step in ms. */
	networkIdle?: number
	/** Time waiting for DOM content to stabilize before the step in ms. */
	contentIdle?: number
	/** Time waiting for page to settle after the action in ms. */
	settle?: number
}

/**
 * What the recorder/runner stored for a step's action. Either a real
 * Action variant, a synthetic plan marker (datepick / map_detect), or
 * null for steps that don't produce an action (conditionals, planning
 * failures, etc.). Reporters consume this purely for display.
 */
export type RecordedAction =
	| Action
	| { action: "datepick"; value?: string; option?: string }
	| { action: "map_detect" }
	// Cached-replay records may carry the freeform step.action string from
	// a HeuristicStep (which may be any of the above plus things like
	// "conditional"). We accept that here for display purposes.
	| { action: string; value?: string; assertion?: { type: string; expected: string } }

/** Result of a single step within a test case. */
export interface StepResult {
	/** The plain-English step text. */
	step: string
	/** The action the LLM chose, a synthetic plan marker, or null. */
	action: RecordedAction | null
	/** Pass or fail. */
	status: "passed" | "failed"
	/** Total duration for this step (LLM + execution) in ms. */
	duration: number
	/** Per-phase timing breakdown. */
	timing?: StepTiming
	/** Post-action screenshot (base64 PNG). */
	screenshot?: string
	/** Error message if the step failed. */
	error?: string
	/** For conditional steps: which branch was taken. */
	conditionResult?: {
		met: boolean
		branch: "then" | "else" | "skipped"
	}
}

/** Result of running a full test case (all steps). */
export interface TestCaseResult {
	/** Test case name. */
	name: string
	/** Overall status — failed if any step failed. */
	status: "passed" | "failed"
	/** Per-step results. */
	steps: StepResult[]
	/** Total duration in ms. */
	duration: number
	/** Execution mode: "pilot" (LLM-driven) or "cached" (heuristic plan replay). */
	mode?: "pilot" | "cached"
	/** Whether the cached plan drifted from the actual application state. */
	drifted?: boolean
	/** Number of original test input steps that completed (for partial plan saving). */
	completedInputSteps?: number
}

/**
 * Structured action returned by the LLM for a single step.
 * Discriminated union over the `action` field. Each variant carries only the
 * fields valid for that action type. See src/pilot/llm/schemas/action.ts.
 */
export type { Action, PlannedStep } from "../pilot/llm/schemas/index.js"
