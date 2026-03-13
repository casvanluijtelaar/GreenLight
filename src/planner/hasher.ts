/**
 * Hashing and slug utilities for cached test plans.
 */

import { createHash } from "node:crypto"

/**
 * Compute a SHA-256 hash of a test case's effective definition.
 * The input should be the fully resolved test case (after variable
 * interpolation and reusable step expansion).
 */
export function computeTestHash(testCase: { steps: string[] }): string {
	const content = JSON.stringify(testCase.steps)
	return createHash("sha256").update(content).digest("hex")
}

/** Convert a name to a URL/filesystem-safe kebab-case slug. */
export function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
}
