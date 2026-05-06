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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { z } from "zod"
import { createOpenAICompatibleProvider } from "../../../../src/pilot/llm/providers/openai-compatible.js"
import { LLMApiError } from "../../../../src/pilot/llm/provider.js"
import { resolveStepResponseSchema } from "../../../../src/pilot/llm/ops/resolve-step.js"
import { planStepsResponseSchema } from "../../../../src/pilot/llm/ops/plan-steps.js"
import { expandStepResponseSchema } from "../../../../src/pilot/llm/ops/expand-step.js"
import { evaluateConditionResponseSchema } from "../../../../src/pilot/llm/ops/evaluate-condition.js"

const trivialSchema = z.object({ ok: z.boolean() })

describe("openai-compatible provider generate() — passthrough mode", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	it("forwards the canonical JSON Schema in response_format with strict: true", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(fetchMock).toHaveBeenCalledTimes(1)
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		expect(body.response_format.type).toBe("json_schema")
		expect(body.response_format.json_schema.name).toBe("thing")
		expect(body.response_format.json_schema.strict).toBe(true)
		expect(body.response_format.json_schema.schema).toMatchObject({
			type: "object",
			properties: { ok: { type: "boolean" } },
			required: ["ok"],
		})
	})

	it("returns the parsed and validated JSON object", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(result).toEqual({ ok: true })
	})

	it("throws LLMApiError on non-2xx", async () => {
		fetchMock.mockResolvedValue(new Response("nope", { status: 401 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toBeInstanceOf(LLMApiError)
	})

	it("throws on empty content", async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: "" } }],
		}), { status: 200 }))
		const provider = createOpenAICompatibleProvider("https://api.example.com/v1")
		await expect(provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})).rejects.toThrow(/empty content/)
	})
})

describe("openai-compatible provider generate() — openai-strict mode", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	it("looks up the OpenAI strict-mode sibling by canonical schema and sends its input shape", async () => {
		// Mock the OpenAI keyed-object response for resolveStepResponseSchema.
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ result: { click: { ref: "e5", text: null, testid: null } } }) } }],
		}), { status: 200 }))

		const provider = createOpenAICompatibleProvider("https://api.example.com/v1", "openai-strict")
		const result = await provider.generate({
			messages: [{ role: "user", content: "click submit" }],
			schema: resolveStepResponseSchema,
			schemaName: "resolve_step_response",
			config: { apiKey: "k", model: "m" },
		})

		// Outgoing schema: keyed-object form (not the canonical flat shape).
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
		const sent = body.response_format.json_schema.schema
		expect(sent.additionalProperties).toBe(false)
		expect(sent.required).toEqual(["result"])
		// `result` should hold a union of keyed-object branches.
		const branches = sent.properties.result.anyOf ?? sent.properties.result.oneOf
		expect(Array.isArray(branches)).toBe(true)
		expect(branches.length).toBe(15)
		const firstKeys = (branches as Array<{ properties: Record<string, unknown> }>).map(
			(b) => Object.keys(b.properties)[0],
		)
		expect(new Set(firstKeys).size).toBe(firstKeys.length)
		expect(firstKeys.sort()).toEqual([
			"assert", "autocomplete", "check", "clear", "click", "count",
			"navigate", "press", "remember", "scroll", "select", "type",
			"uncheck", "upload", "wait",
		])

		// Returned domain shape: canonical Action (un-keyed, nulls stripped).
		expect(result).toEqual({ action: "click", ref: "e5" })
	})

	it("handles the recursive plannedStep schema via the strict sibling", async () => {
		// Recursive case: a conditional step containing a thenBranch with an atomic step.
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({
				steps: [
					{
						conditional: {
							step: "if X then click",
							condition: { type: "visible", target: "X" },
							thenBranch: [
								{
									atomic: {
										step: "click X",
										action: { click: { ref: "e1", text: null, testid: null } },
										inputStepIndex: null,
									},
								},
							],
							elseBranch: null,
							inputStepIndex: 0,
						},
					},
				],
			}) } }],
		}), { status: 200 }))

		const provider = createOpenAICompatibleProvider("https://api.example.com/v1", "openai-strict")
		const result = await provider.generate({
			messages: [{ role: "user", content: "plan it" }],
			schema: planStepsResponseSchema,
			schemaName: "plan_steps_response",
			config: { apiKey: "k", model: "m" },
		})

		expect(result).toEqual({
			steps: [
				{
					kind: "conditional",
					step: "if X then click",
					condition: { type: "visible", target: "X" },
					thenBranch: [
						{
							kind: "atomic",
							step: "click X",
							action: { action: "click", ref: "e1" },
						},
					],
					inputStepIndex: 0,
				},
			],
		})
	})

	it("falls back to the canonical schema when no sibling is registered for the input", async () => {
		// Random user-defined schema not in the STRICT_SIBLINGS map.
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
		}), { status: 200 }))

		const provider = createOpenAICompatibleProvider("https://api.example.com/v1", "openai-strict")
		const result = await provider.generate({
			messages: [{ role: "user", content: "hi" }],
			schema: trivialSchema,
			schemaName: "thing",
			config: { apiKey: "k", model: "m" },
		})
		expect(result).toEqual({ ok: true })
	})
})

// ─── Table-driven round-trip tests ───────────────────────────────────────
//
// Per-variant coverage: each row sends a wire-shaped response (what the LLM
// would emit against the OpenAI strict schema) and asserts the provider
// returns the canonical shape after the sibling's `.transform()` runs. Catches
// drift in any individual variant's keying / null-stripping logic.

interface Row {
	name: string
	schema: z.ZodType<unknown>
	wireResponse: unknown
	expected: unknown
}

const targetingNulls = { ref: null, text: null, testid: null }

const ACTION_VARIANT_ROWS: Row[] = [
	// Element-targeting (ref, text, testid).
	{
		name: "click with ref",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { click: { ref: "e5", text: null, testid: null } } },
		expected: { action: "click", ref: "e5" },
	},
	{
		name: "click with text fallback",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { click: { ref: null, text: "Submit", testid: null } } },
		expected: { action: "click", text: "Submit" },
	},
	{
		name: "click with testid",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { click: { ref: null, text: null, testid: "submit-btn" } } },
		expected: { action: "click", testid: "submit-btn" },
	},
	{
		name: "check",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { check: { ref: "e2", text: null, testid: null } } },
		expected: { action: "check", ref: "e2" },
	},
	{
		name: "uncheck",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { uncheck: { ref: "e3", text: null, testid: null } } },
		expected: { action: "uncheck", ref: "e3" },
	},
	{
		name: "clear",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { clear: { ref: "e4", text: null, testid: null } } },
		expected: { action: "clear", ref: "e4" },
	},

	// Element-targeting + value.
	{
		name: "type",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { type: { ref: "e6", text: null, testid: null, value: "hello" } } },
		expected: { action: "type", ref: "e6", value: "hello" },
	},
	{
		name: "select",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { select: { ref: "e7", text: null, testid: null, option: "GA4" } } },
		expected: { action: "select", ref: "e7", option: "GA4" },
	},
	{
		name: "autocomplete with option set",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: { autocomplete: { ref: "e8", text: null, testid: null, value: "stockh", option: "Stockholm" } },
		},
		expected: { action: "autocomplete", ref: "e8", value: "stockh", option: "Stockholm" },
	},
	{
		name: "autocomplete without option (option null → stripped)",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: { autocomplete: { ref: "e8", text: null, testid: null, value: "x", option: null } },
		},
		expected: { action: "autocomplete", ref: "e8", value: "x" },
	},
	{
		name: "upload via testid",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: { upload: { ref: null, text: null, testid: "file-input", value: "fixtures/img.png" } },
		},
		expected: { action: "upload", testid: "file-input", value: "fixtures/img.png" },
	},

	// Page-level (only value, no targeting).
	{
		name: "scroll",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { scroll: { value: "down" } } },
		expected: { action: "scroll", value: "down" },
	},
	{
		name: "navigate (absolute path)",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { navigate: { value: "/dashboard" } } },
		expected: { action: "navigate", value: "/dashboard" },
	},
	{
		name: "press",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { press: { value: "Enter" } } },
		expected: { action: "press", value: "Enter" },
	},
	{
		name: "wait with no value (value null → stripped)",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { wait: { value: null } } },
		expected: { action: "wait" },
	},
	{
		name: "wait with value",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { wait: { value: "500ms" } } },
		expected: { action: "wait", value: "500ms" },
	},

	// Verification + state-recording.
	{
		name: "assert with ref + compare clause",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: {
				assert: {
					assertion: { type: "compare", expected: "count" },
					ref: "e15",
					compare: { variable: "n", operator: "less_than", literal: null },
				},
			},
		},
		expected: {
			action: "assert",
			assertion: { type: "compare", expected: "count" },
			ref: "e15",
			compare: { variable: "n", operator: "less_than" },
		},
	},
	{
		name: "assert with literal-only compare (variable '_', literal set)",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: {
				assert: {
					assertion: { type: "compare", expected: "count" },
					ref: null,
					compare: { variable: "_", operator: "greater_than", literal: "0" },
				},
			},
		},
		expected: {
			action: "assert",
			assertion: { type: "compare", expected: "count" },
			compare: { variable: "_", operator: "greater_than", literal: "0" },
		},
	},
	{
		name: "assert with no compare (compare null → stripped)",
		schema: resolveStepResponseSchema,
		wireResponse: {
			result: {
				assert: {
					assertion: { type: "contains_text", expected: "Event ID" },
					ref: null,
					compare: null,
				},
			},
		},
		expected: { action: "assert", assertion: { type: "contains_text", expected: "Event ID" } },
	},
	{
		name: "remember",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { remember: { ref: "e15", text: null, rememberAs: "total_price" } } },
		expected: { action: "remember", ref: "e15", rememberAs: "total_price" },
	},
	{
		name: "count via text",
		schema: resolveStepResponseSchema,
		wireResponse: { result: { count: { ref: null, text: "Add to Cart", rememberAs: "cart_buttons" } } },
		expected: { action: "count", text: "Add to Cart", rememberAs: "cart_buttons" },
	},
]

const PLANNED_STEP_ROWS: Row[] = [
	{
		name: "atomic step",
		schema: planStepsResponseSchema,
		wireResponse: {
			steps: [{
				atomic: {
					step: "click submit",
					action: { click: { ref: "e1", ...{ text: null, testid: null } } },
					inputStepIndex: 0,
				},
			}],
		},
		expected: {
			steps: [{
				kind: "atomic",
				step: "click submit",
				action: { action: "click", ref: "e1" },
				inputStepIndex: 0,
			}],
		},
	},
	{
		name: "expand step (no inputStepIndex)",
		schema: planStepsResponseSchema,
		wireResponse: { steps: [{ expand: { step: "fill the form", inputStepIndex: null } }] },
		expected: { steps: [{ kind: "expand", step: "fill the form" }] },
	},
	{
		name: "datepick step",
		schema: planStepsResponseSchema,
		wireResponse: { steps: [{ datepick: { step: "set start to tomorrow", inputStepIndex: 1 } }] },
		expected: { steps: [{ kind: "datepick", step: "set start to tomorrow", inputStepIndex: 1 }] },
	},
	{
		name: "mapdetect step",
		schema: planStepsResponseSchema,
		wireResponse: { steps: [{ mapdetect: { step: "detect map", inputStepIndex: 0 } }] },
		expected: { steps: [{ kind: "mapdetect", step: "detect map", inputStepIndex: 0 }] },
	},
	{
		name: "page step",
		schema: planStepsResponseSchema,
		wireResponse: { steps: [{ page: { step: "click 'Login'", inputStepIndex: 0 } }] },
		expected: { steps: [{ kind: "page", step: "click 'Login'", inputStepIndex: 0 }] },
	},
	{
		name: "conditional with then-branch only (elseBranch null → stripped)",
		schema: planStepsResponseSchema,
		wireResponse: {
			steps: [{
				conditional: {
					step: "if Accept cookies, click",
					condition: { type: "visible", target: "Accept cookies" },
					thenBranch: [{
						page: { step: "click 'Accept cookies'", inputStepIndex: null },
					}],
					elseBranch: null,
					inputStepIndex: 0,
				},
			}],
		},
		expected: {
			steps: [{
				kind: "conditional",
				step: "if Accept cookies, click",
				condition: { type: "visible", target: "Accept cookies" },
				thenBranch: [{ kind: "page", step: "click 'Accept cookies'" }],
				inputStepIndex: 0,
			}],
		},
	},
	{
		name: "conditional with both branches",
		schema: planStepsResponseSchema,
		wireResponse: {
			steps: [{
				conditional: {
					step: "if X then A else B",
					condition: { type: "contains", target: "X" },
					thenBranch: [{ page: { step: "do A", inputStepIndex: null } }],
					elseBranch: [{ page: { step: "do B", inputStepIndex: null } }],
					inputStepIndex: 0,
				},
			}],
		},
		expected: {
			steps: [{
				kind: "conditional",
				step: "if X then A else B",
				condition: { type: "contains", target: "X" },
				thenBranch: [{ kind: "page", step: "do A" }],
				elseBranch: [{ kind: "page", step: "do B" }],
				inputStepIndex: 0,
			}],
		},
	},
]

const EXPAND_STEP_ROWS: Row[] = [
	{
		name: "expand-step response (same shape as plan-steps)",
		schema: expandStepResponseSchema,
		wireResponse: {
			steps: [{
				atomic: {
					step: "type 'Alice' into Name",
					action: { type: { ref: "e1", text: null, testid: null, value: "Alice" } },
					inputStepIndex: null,
				},
			}],
		},
		expected: {
			steps: [{
				kind: "atomic",
				step: "type 'Alice' into Name",
				action: { action: "type", ref: "e1", value: "Alice" },
			}],
		},
	},
]

const EVALUATE_CONDITION_ROWS: Row[] = [
	{
		name: "evaluateCondition with reason",
		schema: evaluateConditionResponseSchema,
		wireResponse: { result: true, reason: "submit button is visible" },
		expected: { result: true, reason: "submit button is visible" },
	},
	{
		name: "evaluateCondition without reason (reason null → stripped)",
		schema: evaluateConditionResponseSchema,
		wireResponse: { result: false, reason: null },
		expected: { result: false },
	},
]

describe("openai-compatible round-trip via STRICT_SIBLINGS", () => {
	const originalFetch = globalThis.fetch
	let fetchMock: ReturnType<typeof vi.fn>
	beforeEach(() => {
		fetchMock = vi.fn()
		globalThis.fetch = fetchMock as unknown as typeof fetch
	})
	afterEach(() => { globalThis.fetch = originalFetch })

	const allRows = [
		...ACTION_VARIANT_ROWS,
		...PLANNED_STEP_ROWS,
		...EXPAND_STEP_ROWS,
		...EVALUATE_CONDITION_ROWS,
	]
	void targetingNulls // referenced inline above; satisfies linters that flag unused locals

	it.each(allRows)("$name → canonical shape", async ({ schema, wireResponse, expected }) => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({
			choices: [{ message: { content: JSON.stringify(wireResponse) } }],
		}), { status: 200 }))

		const provider = createOpenAICompatibleProvider("https://api.example.com/v1", "openai-strict")
		const result = await provider.generate({
			messages: [{ role: "user", content: "go" }],
			schema,
			schemaName: "test",
			config: { apiKey: "k", model: "m" },
		})
		expect(result).toEqual(expected)
	})
})
