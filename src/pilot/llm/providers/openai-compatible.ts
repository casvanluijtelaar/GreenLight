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

import { z } from "zod"
import { type GenerateRequest, type LLMProvider, LLMApiError } from "../provider.js"
import {
	type Action,
	type Compare,
	type PlannedStep,
	compareOperatorSchema,
	assertionSchema,
	conditionSchema,
} from "../schemas/index.js"
import { resolveStepResponseSchema } from "../ops/resolve-step.js"
import { planStepsResponseSchema } from "../ops/plan-steps.js"
import { expandStepResponseSchema } from "../ops/expand-step.js"
import { evaluateConditionResponseSchema } from "../ops/evaluate-condition.js"

/**
 * OpenAI-compatible chat completions provider.
 *
 * Two modes:
 * - "passthrough" (default; used for OpenRouter): sends the canonical Zod-
 *   derived JSON Schema unmodified.
 * - "openai-strict" (used for direct OpenAI): looks up a hand-written sibling
 *   Zod schema for the canonical schema and uses that on the wire instead.
 *   The sibling carries the keyed-object shape OpenAI strict requires plus a
 *   `.transform()` that maps the wire response back to the canonical type.
 *
 * OpenAI strict mode rejects two patterns the canonical Zod schemas produce:
 *   1. `anyOf` branches that share an identical first key (every variant of
 *      `actionSchema` starts with `action: const "<variant>"`). Workaround:
 *      wrap each variant under its own unique property name (`{click: {...}}`,
 *      `{type: {...}}`, …) so each branch's first key is unique.
 *   2. Properties declared but not in `required` (`.optional()`). Workaround:
 *      use `.nullable()` so the property is required and accepts null.
 *
 * Each sibling encodes BOTH the wire shape (via `z.strictObject` + `.nullable()`
 * on optional fields + keyed-object form for unions) AND the inverse mapping
 * back to the canonical type (via `.transform()`). Calling `sibling.parse(raw)`
 * does validation + un-keying + null-stripping in one step. The provider does
 * not need to walk anything manually.
 *
 * References:
 *   https://platform.openai.com/docs/guides/structured-outputs/supported-schemas
 *   https://community.openai.com/t/objects-provided-via-anyof-must-not-share-identical-first-keys-error-in-structured-output/958572
 */

type OpenAIMode = "openai-strict" | "passthrough"

export function createOpenAICompatibleProvider(
	baseUrl: string,
	mode: OpenAIMode = "passthrough",
): LLMProvider {
	const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`

	return {
		async generate<T>(req: GenerateRequest<T>): Promise<T> {
			// Look up the OpenAI strict-mode sibling for this canonical schema.
			// If there isn't one, fall back to the canonical (this is also the
			// passthrough-mode path).
			const sibling = STRICT_SIBLINGS.get(req.schema) as z.ZodType<T> | undefined
			const useStrict = mode === "openai-strict" && sibling !== undefined
			const wireSchema = useStrict ? sibling! : req.schema
			
			// `io: "input"` emits the pre-`.transform()` shape (the wire shape the
			// provider sends to the LLM); the post-transform shape is what
			// `wireSchema.parse(...)` returns below.
			// `unrepresentable: "any"` lets schemas with `.transform()` through
			// without throwing — Zod walks the input side cleanly.
			const jsonSchema = z.toJSONSchema(wireSchema, {
				target: "draft-7",
				io: useStrict ? "input" : "output",
				unrepresentable: "any",
			}) as object

			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${req.config.apiKey}`,
				},
				body: JSON.stringify({
					model: req.config.model,
					messages: req.messages,
					temperature: 0,
					response_format: {
						type: "json_schema",
						json_schema: {
							name: req.schemaName,
							schema: jsonSchema,
							strict: true,
						},
					},
					// In passthrough mode (OpenRouter) ask the router to refuse
					// the request rather than route to a provider that doesn't
					// actually support `response_format`. Without this, free-tier
					// models accept the request and silently return 0 output
					// tokens because their decoder can't honour the schema.
					// https://openrouter.ai/docs/features/provider-routing#provider-parameters
					...(mode === "passthrough" ? { provider: { require_parameters: true } } : {}),
				}),
			})

			if (!response.ok) {
				const body = await response.text()
				throw new LLMApiError(response.status, body)
			}

			const data = (await response.json()) as {
				choices?: {
					message?: {
						content?: string | null
						refusal?: string | null
						tool_calls?: unknown
						reasoning?: string | null
					}
					finish_reason?: string | null
				}[]
				usage?: { completion_tokens?: number }
				model?: string
				provider?: string
				error?: { message?: string; code?: string | number }
			}

			// OpenRouter / OpenAI can return 200 OK with various non-content shapes:
			// refusals, tool calls, content filtering, length-truncation, routing
			// errors stuffed into a top-level `error` object, or — most insidiously
			// on weak free-tier models — a successful 200 with `completion_tokens: 0`
			// because the underlying provider couldn't constrain-decode against the
			// schema and just gave up. Surface what we got rather than collapsing
			// all of it to "empty response".
			if (data.error?.message) {
				throw new LLMApiError(200, `provider error: ${data.error.message}${data.error.code ? ` (code: ${String(data.error.code)})` : ""}`)
			}
			const choice = data.choices?.[0]
			const message = choice?.message
			const content = message?.content
			if (!content) {
				const finish = choice?.finish_reason
				const completionTokens = data.usage?.completion_tokens
				const routedTo = data.provider ? ` (routed to ${data.provider}` + (data.model ? `, model ${data.model}` : "") + ")" : ""
				const detail =
					message?.refusal ? `refusal: ${message.refusal}` :
					message?.tool_calls ? `tool_calls returned instead of content (model emitted ${JSON.stringify(message.tool_calls).slice(0, 200)})` :
					finish === "length" ? "response truncated by max_tokens (finish_reason=length)" :
					finish === "content_filter" ? "content filtered (finish_reason=content_filter)" :
					completionTokens === 0 ? `model produced 0 output tokens${routedTo} — likely doesn't actually support structured output for this schema. Try a paid/non-free model, or pin a known-good provider via OpenRouter's provider routing.` :
					finish ? `finish_reason=${finish}` :
					!data.choices?.length ? "no choices in response" :
					"unknown empty-response shape"
				const bodyTail = JSON.stringify(data).slice(0, 1000)
				throw new Error(`LLM returned empty content. ${detail}. Response: ${bodyTail}`)
			}

			const raw = JSON.parse(content) as unknown
			return wireSchema.parse(raw)
		},
	}
}


// Reusable field fragments used across multiple schemas.
const ref = z.string().regex(/^e\d+$/).nullable()
const text = z.string().nullable()
const testid = z.string().nullable()
const rememberAs = z.string().regex(/^[a-z][a-z0-9_]*$/)
const targeting = { ref, text, testid }
const step = z.string()
const inputStepIndex = z.number().int().nonnegative().nullable()

/**
 * Remove null/undefined fields from an object so a parsed wire payload (where
 * every field is required-with-null) collapses to the canonical shape (where
 * the same fields are absent when they were null).
 */
function strip(o: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v
	return out
}

/**
 * Build a keyed-object wire wrapper: `{ <kind>: { ...payload } }`. Each
 * variant's first key is the kind itself, satisfying OpenAI's "no shared
 * first keys in anyOf branches" rule.
 */
function keyed<K extends string, P extends z.ZodRawShape>(kind: K, payload: P) {
	return z.strictObject({ [kind]: z.strictObject(payload) } as Record<K, z.ZodObject<P>>)
}

/**
 * Variant builder for `actionSchema` (discriminator field is `action`). Wraps
 * the payload in keyed-object form, then unwraps + strips nulls on parse to
 * produce the canonical `Action` shape.
 */
function actionVariant<K extends Action["action"]>(kind: K, payload: z.ZodRawShape) {
	return keyed(kind, payload)
		.transform((wire): Action => ({ action: kind, ...strip((wire as Record<K, Record<string, unknown>>)[kind]) }) as Action)
}

/**
 * Variant builder for `plannedStepSchema` (discriminator field is `kind`).
 * Same pattern as {@link actionVariant} but produces canonical `PlannedStep`.
 */
function plannedVariant<K extends PlannedStep["kind"]>(kind: K, payload: z.ZodRawShape) {
	return keyed(kind, payload)
		.transform((wire): PlannedStep => ({ kind, ...strip((wire as Record<K, Record<string, unknown>>)[kind]) }) as PlannedStep)
}

/**
 * takes the "Compare" schema, and converts it into an openAI safe schema
 */
const compareSchemaForOpenAI = z.strictObject({
	variable: z.string().regex(/^(_|[a-z][a-z0-9_]*)$/),
	operator: compareOperatorSchema,
	literal: z.string().nullable(),
}).transform((c) => strip(c) as Compare)

/**
 * takes the "Action" schema, and converts it into an openAI safe schema 
 * based on the action type
 */
const actionSchemaForOpenAI: z.ZodType<Action> = z.union([
	actionVariant("click", targeting),
	actionVariant("check", targeting),
	actionVariant("uncheck", targeting),
	actionVariant("clear", targeting),
	actionVariant("type", { ...targeting, value: z.string() }),
	actionVariant("select", { ...targeting, option: z.string() }),
	actionVariant("autocomplete", { ...targeting, value: z.string(), option: z.string().nullable() }),
	actionVariant("scroll", { value: z.string() }),
	actionVariant("navigate", { value: z.string().regex(/^(https?:\/\/|\/)/) }),
	actionVariant("press", { value: z.string() }),
	actionVariant("wait", { value: z.string().nullable() }),
	actionVariant("upload", { ...targeting, value: z.string() }),
	actionVariant("assert", { assertion: assertionSchema, ref, compare: compareSchemaForOpenAI.nullable() }),
	actionVariant("remember", { ref, text, rememberAs }),
	actionVariant("count", { ref, text, rememberAs }),
])

/**
 * schema for the plannedStep operation, just with specific support for openAI
 */
const plannedStepSchemaForOpenAI: z.ZodType<PlannedStep> = z.lazy(() => z.union([
	plannedVariant("atomic", { step, action: actionSchemaForOpenAI, inputStepIndex }),
	plannedVariant("expand", { step, inputStepIndex }),
	plannedVariant("datepick", { step, inputStepIndex }),
	plannedVariant("mapdetect", { step, inputStepIndex }),
	plannedVariant("page", { step, inputStepIndex }),
	plannedVariant("conditional", {
		step,
		condition: conditionSchema,
		thenBranch: z.array(plannedStepSchemaForOpenAI),
		elseBranch: z.array(plannedStepSchemaForOpenAI).nullable(),
		inputStepIndex,
	}),
]))

/**
 * schema for the resolveStep operation, just with specific support for openAI
 */
const resolveStepResponseSchemaForOpenAI = z.strictObject({
	result: actionSchemaForOpenAI,
}).transform(({ result }): Action => result)

/**
 * schema for the planStep operation, just with specific support for openAI
 */
const planStepsResponseSchemaForOpenAI = z.strictObject({
	steps: z.array(plannedStepSchemaForOpenAI),
})

/**
 * schema for the expandStep operation, just with specific support for openAI
 */
const expandStepResponseSchemaForOpenAI = z.strictObject({
	steps: z.array(plannedStepSchemaForOpenAI),
})

/**
 * schema for the evaluateCondition operation, just with specific support for openAI
 */
const evaluateConditionResponseSchemaForOpenAI = z.strictObject({
	result: z.boolean(),
	reason: z.string().nullable(),
}).transform((r) => strip(r) as { result: boolean; reason?: string })

/**
 * Lookup table: to convert from the base operation schemas to the 
 * openAI strict equivalent.
 */
const STRICT_SIBLINGS = new Map<unknown, z.ZodType<unknown>>([
	[resolveStepResponseSchema, resolveStepResponseSchemaForOpenAI],
	[planStepsResponseSchema, planStepsResponseSchemaForOpenAI],
	[expandStepResponseSchema, expandStepResponseSchemaForOpenAI],
	[evaluateConditionResponseSchema, evaluateConditionResponseSchemaForOpenAI],
])
