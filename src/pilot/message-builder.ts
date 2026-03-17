/**
 * Message construction helpers for the LLM client.
 */

import type { PageState } from "../reporter/types.js"
import { formatA11yTree } from "./a11y-parser.js"
import { SYSTEM_PROMPT } from "./prompts.js"
import type { ChatMessage } from "./providers/types.js"

/** Build the user message containing the step and full page state. */
export function buildUserMessage(step: string, pageState: PageState): string {
	const tree = formatA11yTree(pageState.a11yTree)
	const parts = [
		`Current URL: ${pageState.url}`,
		`Page title: ${pageState.title}`,
		"",
		"Accessibility tree:",
		tree,
	]

	if (pageState.visibleText) {
		parts.push("", "Visible page text:", pageState.visibleText)
	}

	parts.push("", `Step to execute: ${step}`)
	return parts.join("\n")
}

/**
 * Compute a line-level diff between two tree strings.
 * Returns added and removed lines, preserving order.
 */
export function computeTreeDiff(
	oldTree: string,
	newTree: string,
): { added: string[]; removed: string[]; changedRatio: number } {
	const oldLines = oldTree.split("\n")
	const newLines = newTree.split("\n")
	const oldSet = new Set(oldLines)
	const newSet = new Set(newLines)
	const added = newLines.filter((l) => !oldSet.has(l))
	const removed = oldLines.filter((l) => !newSet.has(l))
	const total = Math.max(oldLines.length, newLines.length)
	return {
		added,
		removed,
		changedRatio: total > 0 ? (added.length + removed.length) / total : 0,
	}
}

/**
 * Build a compact message for subsequent steps on the same page.
 * Refs are stable across captures (derived from structural identity), so:
 * - If the a11y tree is identical: skip both tree and visible text ("unchanged").
 * - If < 30% of tree lines changed: send only the diff ("tree-diff").
 * - If >= 30% changed: send the full tree without visible text ("tree-only").
 * Returns null if we should send full state instead (e.g. after navigation).
 */
export function buildCompactMessage(
	step: string,
	pageState: PageState,
	prevState: PageState,
	prevTree: string,
): { message: string; mode: "unchanged" | "tree-diff" | "tree-only" } | null {
	// If the URL path changed, the page is fundamentally different — send full state
	try {
		const oldPath = new URL(prevState.url).pathname
		const newPath = new URL(pageState.url).pathname
		if (oldPath !== newPath) return null
	} catch {
		return null
	}

	const tree = formatA11yTree(pageState.a11yTree)
	const treeUnchanged = tree === prevTree

	if (treeUnchanged) {
		const parts = [
			`Current URL: ${pageState.url}`,
			"",
			"Page state is unchanged from the previous step. All element refs remain the same.",
			"",
			`Step to execute: ${step}`,
		]
		return { message: parts.join("\n"), mode: "unchanged" }
	}

	const { added, removed, changedRatio } = computeTreeDiff(prevTree, tree)

	// Small change — send just the diff. Refs are stable so the LLM can
	// combine this with the full tree it saw earlier.
	if (changedRatio < 0.3) {
		const parts = [
			`Current URL: ${pageState.url}`,
			"",
			"Accessibility tree changes (refs are stable — unchanged elements keep their refs from the previous message):",
		]
		if (removed.length > 0) {
			parts.push("Removed elements:")
			for (const line of removed) parts.push(`  - ${line.trim()}`)
		}
		if (added.length > 0) {
			parts.push("New/changed elements:")
			for (const line of added) parts.push(`  + ${line.trim()}`)
		}
		parts.push("", `Step to execute: ${step}`)
		return { message: parts.join("\n"), mode: "tree-diff" }
	}

	// Large change — send full tree without visible text
	const parts = [
		`Current URL: ${pageState.url}`,
		`Page title: ${pageState.title}`,
		"",
		"Accessibility tree (updated — refs are stable, only changed elements have new/removed entries):",
		tree,
		"",
		`Step to execute: ${step}`,
	]
	return { message: parts.join("\n"), mode: "tree-only" }
}

/** Build the full messages array for a chat completion request. */
export function buildMessages(
	step: string,
	pageState: PageState,
): ChatMessage[] {
	return [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: buildUserMessage(step, pageState) },
	]
}
