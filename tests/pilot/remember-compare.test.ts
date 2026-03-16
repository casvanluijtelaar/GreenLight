import { describe, it, expect } from "vitest"
import { parseActionResponse, parsePlanResponse, validatePlanReferences } from "../../src/pilot/response-parser.js"
import { buildCompactMessage } from "../../src/pilot/message-builder.js"
import type { PageState } from "../../src/reporter/types.js"

// ── parsePlanResponse: REMEMBER / COMPARE ────────────────────────────

describe("parsePlanResponse — REMEMBER", () => {
	it("parses a REMEMBER line", () => {
		const result = parsePlanResponse(
			'REMEMBER "the number of products shown" as "product_count"',
		)
		expect(result).toHaveLength(1)
		expect(result[0].step).toBe("the number of products shown")
		expect(result[0].action).toBeNull()
		expect(result[0].rememberAs).toBe("product_count")
	})

	it("parses REMEMBER case-insensitively", () => {
		const result = parsePlanResponse(
			'remember "total price" as "price"',
		)
		expect(result[0].rememberAs).toBe("price")
		expect(result[0].step).toBe("total price")
	})

	it("does not set rememberAs on non-REMEMBER steps", () => {
		const result = parsePlanResponse('PAGE "click the button"')
		expect(result[0].rememberAs).toBeUndefined()
	})
})

describe("parsePlanResponse — COMPARE", () => {
	it("parses a COMPARE line as null action with compare metadata", () => {
		const result = parsePlanResponse(
			'COMPARE "the number of products shown" "less_than" remembered "product_count"',
		)
		expect(result).toHaveLength(1)
		// COMPARE needs runtime resolution (action is null)
		expect(result[0].action).toBeNull()
		expect(result[0].step).toBe("the number of products shown")
		expect(result[0].compare).toEqual({
			variable: "product_count",
			operator: "less_than",
		})
	})

	it("parses all comparison operators", () => {
		const operators = [
			"less_than",
			"greater_than",
			"equal",
			"not_equal",
			"less_or_equal",
			"greater_or_equal",
		]
		for (const op of operators) {
			const result = parsePlanResponse(
				`COMPARE "value" "${op}" remembered "var"`,
			)
			expect(result[0].compare!.operator).toBe(op)
		}
	})

	it("parses COMPARE case-insensitively", () => {
		const result = parsePlanResponse(
			'compare "count" "greater_than" remembered "old_count"',
		)
		expect(result[0].compare!.variable).toBe("old_count")
		expect(result[0].compare!.operator).toBe("greater_than")
	})
})

describe("parsePlanResponse — mixed plan with REMEMBER/COMPARE", () => {
	it("parses a full plan with remember and compare", () => {
		const raw = [
			'REMEMBER "the result count" as "count_before"',
			'PAGE "select Red in the color filter"',
			'COMPARE "the result count" "less_than" remembered "count_before"',
		].join("\n")
		const result = parsePlanResponse(raw)
		expect(result).toHaveLength(3)

		// REMEMBER
		expect(result[0].rememberAs).toBe("count_before")
		expect(result[0].action).toBeNull()
		expect(result[0].step).toBe("the result count")

		// PAGE
		expect(result[1].action).toBeNull()
		expect(result[1].rememberAs).toBeUndefined()

		// COMPARE — null action, compare metadata on step
		expect(result[2].action).toBeNull()
		expect(result[2].compare!.variable).toBe("count_before")
		expect(result[2].compare!.operator).toBe("less_than")
	})
})

// ── validatePlanReferences ───────────────────────────────────────────

describe("validatePlanReferences", () => {
	it("returns no errors for valid plan", () => {
		const plan = parsePlanResponse([
			'REMEMBER "count" as "before_count"',
			'PAGE "click filter"',
			'COMPARE "count" "less_than" remembered "before_count"',
		].join("\n"))
		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("returns error when COMPARE references missing REMEMBER", () => {
		const plan = parsePlanResponse(
			'COMPARE "count" "less_than" remembered "nonexistent"',
		)
		const errors = validatePlanReferences(plan)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("nonexistent")
	})

	it("returns error when COMPARE appears before its REMEMBER", () => {
		const plan = parsePlanResponse([
			'COMPARE "count" "less_than" remembered "total"',
			'REMEMBER "count" as "total"',
		].join("\n"))
		const errors = validatePlanReferences(plan)
		expect(errors).toHaveLength(1)
		expect(errors[0]).toContain("total")
	})

	it("handles multiple REMEMBER/COMPARE pairs", () => {
		const plan = parsePlanResponse([
			'REMEMBER "price" as "price_before"',
			'REMEMBER "count" as "count_before"',
			'PAGE "apply filter"',
			'COMPARE "price" "equal" remembered "price_before"',
			'COMPARE "count" "less_than" remembered "count_before"',
		].join("\n"))
		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("returns no errors for plan with no COMPARE steps", () => {
		const plan = parsePlanResponse([
			'PAGE "click button"',
			'assert contains_text "Hello"',
		].join("\n"))
		expect(validatePlanReferences(plan)).toEqual([])
	})

	it("allows REMEMBER without matching COMPARE (unused is fine)", () => {
		const plan = parsePlanResponse(
			'REMEMBER "count" as "unused_var"',
		)
		expect(validatePlanReferences(plan)).toEqual([])
	})
})

// ── parseActionResponse: remember and compare fields ─────────────────

describe("parseActionResponse — remember action", () => {
	it("parses a remember action", () => {
		const action = parseActionResponse(
			'{"action":"remember","ref":"e15","rememberAs":"product_count"}',
		)
		expect(action.action).toBe("remember")
		expect(action.ref).toBe("e15")
		expect(action.rememberAs).toBe("product_count")
	})
})

describe("parseActionResponse — compare assertion", () => {
	it("parses a compare assertion", () => {
		const action = parseActionResponse(
			'{"action":"assert","ref":"e15","assertion":{"type":"compare","expected":"product count"},"compare":{"variable":"count_before","operator":"less_than"}}',
		)
		expect(action.action).toBe("assert")
		expect(action.assertion).toEqual({
			type: "compare",
			expected: "product count",
		})
		expect(action.compare).toEqual({
			variable: "count_before",
			operator: "less_than",
		})
	})

	it("parses compare with all operators", () => {
		const operators = [
			"less_than",
			"greater_than",
			"equal",
			"not_equal",
		]
		for (const op of operators) {
			const action = parseActionResponse(
				`{"action":"assert","assertion":{"type":"compare","expected":"x"},"compare":{"variable":"v","operator":"${op}"}}`,
			)
			expect(action.compare!.operator).toBe(op)
		}
	})
})

// ── buildCompactMessage ──────────────────────────────────────────────

describe("buildCompactMessage", () => {
	const basePage: PageState = {
		a11yTree: [
			{ ref: "e1", role: "button", name: "Submit", raw: '- button "Submit"' },
			{ ref: "e2", role: "textbox", name: "Email", raw: '- textbox "Email"' },
		],
		a11yRaw: "",
		url: "https://example.com/page",
		title: "Test Page",
		consoleLogs: [],
	}

	it("returns 'unchanged' when tree is identical", () => {
		const result = buildCompactMessage(
			"click submit",
			basePage,
			basePage,
			'[e1] button "Submit"\n[e2] textbox "Email"',
		)
		expect(result).not.toBeNull()
		expect(result!.mode).toBe("unchanged")
		expect(result!.message).toContain("unchanged")
		expect(result!.message).toContain("click submit")
		expect(result!.message).not.toContain("button")
	})

	it("returns null when URL path changed", () => {
		const otherPage = { ...basePage, url: "https://example.com/other" }
		const result = buildCompactMessage(
			"click submit",
			otherPage,
			basePage,
			'[e1] button "Submit"',
		)
		expect(result).toBeNull()
	})

	it("returns 'tree-diff' when small change in tree", () => {
		// Need enough base lines so adding one stays under 30% change ratio
		const manyNodes = Array.from({ length: 10 }, (_, i) => ({
			ref: `e${String(i + 1)}`,
			role: "link",
			name: `Link ${String(i)}`,
			raw: `- link "Link ${String(i)}"`,
		}))
		const bigPage: PageState = {
			...basePage,
			a11yTree: manyNodes,
		}
		const newNodes = [
			...manyNodes,
			{ ref: "e20", role: "button", name: "Cancel", raw: '- button "Cancel"' },
		]
		const newPage: PageState = { ...basePage, a11yTree: newNodes }
		const prevTree = manyNodes.map((n) => `[${n.ref}] ${n.role} "${n.name}"`).join("\n")
		const result = buildCompactMessage("click cancel", newPage, bigPage, prevTree)
		expect(result).not.toBeNull()
		expect(result!.mode).toBe("tree-diff")
		expect(result!.message).toContain("Cancel")
		expect(result!.message).toContain("click cancel")
	})

	it("returns 'tree-only' when many lines changed", () => {
		// Create a page where >30% of lines differ
		const manyNodes = Array.from({ length: 20 }, (_, i) => ({
			ref: `e${String(i + 100)}`,
			role: "link",
			name: `Link ${String(i)}`,
			raw: `- link "Link ${String(i)}"`,
		}))
		const newPage: PageState = {
			...basePage,
			a11yTree: manyNodes,
		}
		const prevTree = '[e1] button "Submit"\n[e2] textbox "Email"'
		const result = buildCompactMessage("click something", newPage, basePage, prevTree)
		expect(result).not.toBeNull()
		expect(result!.mode).toBe("tree-only")
		// Should contain the full tree
		expect(result!.message).toContain("Link 0")
		expect(result!.message).toContain("Link 19")
	})
})
