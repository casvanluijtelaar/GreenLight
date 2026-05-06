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
import type { ChatMessage, LLMProvider, ProviderConfig } from "../provider.js"
import { LLMApiError } from "../provider.js"
import { complete } from "../complete.js"
import {
	actionSchema,
	assertionSchema,
	compareSchema,
	type Action,
} from "../schemas/index.js"
import { pruneHistory } from "../history.js"
import { buildUserMessage, buildCompactMessage } from "../../message-builder.js"
import { formatA11yTree } from "../../a11y-parser.js"
import type { PageState } from "../../../reporter/types.js"
import { globals } from "../../../globals.js"

const ACTION_KINDS = [
	"click", "check", "uncheck", "type", "clear", "select", "autocomplete",
	"scroll", "navigate", "press", "wait", "upload", "assert", "remember", "count",
] as const

/**
 * Canonical wire schema for `resolveStep`. Flat single-object shape:
 *   `{ action: <enum>, ref?, text?, value?, … }`
 *
 * Why flat instead of `{ result: <discriminated union> }`? Anthropic's
 * tool-use parser stringifies the inner object whenever a tool parameter is
 * typed as a top-level `oneOf` / `anyOf`. The model emits
 * `{"result": "{\"action\": \"click\", \"ref\": \"e5\"}"}` (string) instead of
 * nesting properly, and the schema validator then rejects it. The flat shape
 * has no `oneOf` anywhere, so the model emits a clean object every time.
 *
 * The `.transform()` runs `actionSchema.parse(...)` on the validated wire
 * shape, so the schema's output type is the strict canonical `Action` (per-
 * variant rules enforced after generation). Other providers (Gemini,
 * OpenRouter, claude-api) accept this same schema unmodified. The OpenAI
 * provider uses the sibling below.
 */
export const resolveStepResponseSchema = z.strictObject({
	action: z.enum(ACTION_KINDS).describe(
		"Which browser action to perform. Variants and their required fields:\n" +
		"- click / check / uncheck / clear: targeting (ref preferred, fall back to text or testid).\n" +
		"- type: targeting + value (the literal text to type).\n" +
		"- select: targeting + option (the dropdown option label).\n" +
		"- autocomplete: targeting + value (search text) + optional option (which suggestion).\n" +
		"- scroll: value ('up' / 'down' / 'top' / 'bottom' or a target description).\n" +
		"- navigate: value (absolute URL or path starting with '/'). Do NOT use for 'go to X page' — that's a click.\n" +
		"- press: value (key name like 'Enter' or 'Control+A').\n" +
		"- wait: optional value (duration like '500ms' or text to wait for).\n" +
		"- upload: targeting + value (file path; comma-separated for multiple files).\n" +
		"- assert: assertion (the check) + optional ref + optional compare clause.\n" +
		"- remember: targeting + rememberAs (variable name to store the captured text).\n" +
		"- count: targeting + rememberAs (variable name to store the count).",
	),
	ref: z.string()
		.regex(/^e\d+$/)
		.describe("Stable element ref from the accessibility tree, e.g. 'e1', 'e2'.")
		.optional(),
	text: z.string().describe("Visible text on the element. Use when ref is not available.").optional(),
	testid: z.string().describe("Value of the element's data-testid attribute.").optional(),
	value: z.string().describe("Free-form value whose meaning depends on 'action'.").optional(),
	option: z.string().describe("For 'select': dropdown option label. For 'autocomplete': suggestion to pick.").optional(),
	assertion: assertionSchema.optional(),
	compare: compareSchema.optional(),
	rememberAs: z.string()
		.regex(/^[a-z][a-z0-9_]*$/)
		.describe("For 'remember' / 'count': snake_case identifier.")
		.optional(),
}).transform((flat): Action => actionSchema.parse(flat))

/** Stable name forwarded to providers (OpenAI tool name, Anthropic tool name). */
export const RESOLVE_STEP_SCHEMA_NAME = "resolve_step_response"

export const SYSTEM_PROMPT = `You are The Pilot, an AI agent that executes end-to-end tests in a web browser.

You receive a plain-English test step and the current page state.
Your job is to determine the SINGLE browser action needed to execute the step.
Return a JSON object matching the response schema. No extra explanation.

═══ Page state ═══

The page state may be provided in different levels of detail:
- Full state: complete accessibility tree with enrichment data (first step and after navigation).
- Tree diff: only the added/removed lines from the accessibility tree (when a small part of the page changed, e.g. a form wizard step).
  Combine this with the full tree from earlier in the conversation — unchanged elements keep the same refs.
- Unchanged: the page is identical to the previous step.

Element refs (e1, e2, ...) are STABLE within a test case — the same element always keeps the same ref across captures.
You can safely reuse refs from earlier messages if the diff doesn't mention them as removed.

Each element in the tree may include enrichment properties indented below it:
- "text": the visible text content (only shown when different from the element's a11y name)
- "placeholder": the placeholder attribute (for inputs)
- "value": the current input value or selected option

═══ Element targeting ═══

- ALWAYS use "ref" to target elements. Use the enrichment properties (text, placeholder, value) to match the step description to the right element.
- Use "text" ONLY as a last resort when the element is genuinely not in the accessibility tree. This is rare.
- Never guess a ref. If you cannot confidently identify the element in the tree, use "text".
- Use enrichment data to match fuzzy descriptions: if the step says "password field", match it to a textbox with placeholder "Enter visitor password".
- When the step contains a word or phrase in quotes (e.g. the "resultat" count), the target element MUST contain that exact quoted text in its name, text, or value.

═══ Interaction actions ═══

- click: Click an element. Use "ref" when available; fall back to "text" only when the element is not in the tree.
- check / uncheck: Toggle a checkbox. Use instead of click for checkboxes.
- type: Type text into an input. When the step says "a string" or "some test data", generate realistic values that match the field name. When the step says "random string" or "random number", generate a fully random value.
- clear: Clear a field, filter, selection, or tag input. Use for any step that says "clear", "reset", or "remove" a field or filter. The runtime detects the element type and finds the appropriate clear mechanism automatically.
- upload: Upload file(s) to a file input. Use "testid" (data-testid value) when the step mentions one — it is the most reliable way to target hidden file inputs. Otherwise use "ref" or "text". For multiple files, separate paths with a comma. Use this for steps that say "upload", "attach", or "select a file".
- For date/time inputs: compute the actual date/time value from the current time provided in the page state when the step uses relative expressions like "now plus 1 hour" or "tomorrow". Format dates as the input expects (check placeholder or input type).
- select: Select a dropdown option. The "option" field holds the option label.
- autocomplete: Type into an autocomplete field, wait for suggestions, pick one. The "option" field selects a specific suggestion; defaults to first if omitted.
- scroll: Page scroll uses "value" (up, down, top, bottom). To scroll a specific element into view, use "ref" or "text" with no "value".
- navigate: Go to a URL. The "value" field holds the URL or path.
- press: Press a key. The "value" field holds the key name (e.g. "Enter", "Tab", "Escape").
- wait: Wait for a condition. The "value" field describes what to wait for.
- remember: Capture a value from the page for later comparison. Target the most specific element containing the value, not a parent or wrapper. Use "rememberAs" for the variable name.
- count: Count elements matching a description. Use "text" with a value that matches ALL target elements and ONLY those elements. Prefer a common role or accessible name shared by all instances. Use "rememberAs" for the variable name.

═══ Assertion actions ═══

Any step starting with "check that" is ALWAYS an assertion — never return an interaction.

Assertion type selection:
- contains_text / not_contains_text: check that the page body contains (or does not contain) a LITERAL substring. Use this whenever the step quotes a fixed string (e.g. "check that the page contains 'Event ID'") or describes static text. The "expected" field holds the literal substring.
- contains_remembered: check that a previously REMEMBERED variable's value appears on the page. ONLY use when the step refers back to a value captured by an earlier "remember" action (e.g. "check that the order ID we remembered is shown"). Set "compare.variable" to the variable name; "expected" is a short human-readable description. NEVER use this for literal substrings — that is contains_text.
- url_contains: check the current URL.
- element_visible / element_not_visible: check element visibility.
- element_disabled / element_enabled: check if a button is disabled or enabled.
- element_in_viewport / element_not_in_viewport: check if an element is within the visible viewport. Use after scroll actions to verify an element was scrolled into (or out of) view.
- element_exists / link_exists / field_exists: check element presence.
- compare: numeric comparison against a remembered variable or a literal number. Against a remembered variable: set "variable" to the variable name. Against a literal number: set "literal" to the number and "variable" to "_".
- map_state: assert a condition about the map (see Map section below).

═══ Map ═══

When a map is detected, the page state includes a "Map state" section with center, zoom, bearing, pitch, bounds, and layers.

For ANY step about the map's position, zoom, area, or content, use assertion type "map_state" — NEVER "contains_text".
The map is a WebGL canvas; its content does NOT appear in the DOM.

map_state "expected" examples:
- "map shows Stockholm"
- "zoom level is at least 10"
- "layer hospitals is visible"

═══ Decision examples ═══

Each example is the full top-level response object. Set "action" to the variant name and fill ONLY the fields meaningful for that variant; leave the rest unset.

Clicking a button by ref (ref available in tree):
{"action":"click","ref":"e5"}

Clicking when element is not in the tree (text fallback):
{"action":"click","text":"About us"}

Typing realistic test data into an email field:
{"action":"type","ref":"e3","value":"jane@example.com"}

Autocomplete with a specific suggestion:
{"action":"autocomplete","ref":"e4","value":"foo","option":"foobar inc"}

Uploading via data-testid (hidden file input pattern):
{"action":"upload","testid":"og-file-input","value":"fixtures/og_image.png"}

Remembering a value (target the specific element, not a wrapper):
{"action":"remember","ref":"e15","rememberAs":"product_count"}

Counting elements (text must match ALL and ONLY the target elements):
{"action":"count","text":"Add to Cart","rememberAs":"cart_buttons"}

Compare against a remembered variable:
{"action":"assert","assertion":{"type":"compare","expected":"product count"},"ref":"e15","compare":{"variable":"product_count","operator":"less_than"}}

Compare against a literal number (variable set to "_"; literal is a string):
{"action":"assert","assertion":{"type":"compare","expected":"product count"},"ref":"e15","compare":{"variable":"_","operator":"greater_than","literal":"0"}}

Literal substring check (the step quotes a fixed string):
{"action":"assert","assertion":{"type":"contains_text","expected":"Event ID"}}

Check that a remembered value is on the page (the step refers to a value captured earlier by "remember"):
{"action":"assert","assertion":{"type":"contains_remembered","expected":"the saved order id"},"compare":{"variable":"order_id","operator":"equal"}}

Map assertion:
{"action":"assert","assertion":{"type":"map_state","expected":"map shows Stockholm"}}
`

export interface ResolveStepDeps {
	provider: LLMProvider
	config: ProviderConfig
	history: ChatMessage[]
	prevPageState: PageState | null
	prevFormattedTree: string
	cache: Map<string, Action>
}

export interface ResolveStepResult {
	action: Action
	newHistory: ChatMessage[]
	newPrevPageState: PageState
	newPrevFormattedTree: string
}

/**
 * Resolve a single step using the page state and accessibility tree.
 * Mirrors the previous createLLMClient::resolveStep behaviour: cache check,
 * compact-vs-full message build, history pruning, context-length recovery.
 */
export async function resolveStep(
	step: string,
	pageState: PageState,
	deps: ResolveStepDeps,
): Promise<ResolveStepResult> {
	// 1. Cache check.
	const cacheKey = `${step}\0${pageState.url}`
	const cached = deps.cache.get(cacheKey)
	if (cached) {
		return {
			action: cached,
			newHistory: deps.history,
			newPrevPageState: pageState,
			newPrevFormattedTree: deps.prevFormattedTree,
		}
	}

	// 2. Build the user message (compact when possible).
	let userMessage: string
	let compactMode = "full"
	if (deps.prevPageState && deps.history.length > 0) {
		const compact = buildCompactMessage(step, pageState, deps.prevPageState, deps.prevFormattedTree)
		if (compact) {
			userMessage = compact.message
			compactMode = compact.mode
		} else {
			userMessage = buildUserMessage(step, pageState)
		}
	} else {
		userMessage = buildUserMessage(step, pageState)
	}

	if (globals.debug) {
		console.log(`      [resolve] Mode: ${compactMode} (${String(userMessage.length)} chars)`)
		console.log(`      [resolve] LLM input:\n${userMessage}`)
	}

	// 3. Prune history to fit token budget.
	const { history: historySlice } = pruneHistory({ systemPrompt: SYSTEM_PROMPT, userMessage, history: deps.history })
	if (historySlice.length !== deps.history.length && globals.debug) {
		console.log(`      [resolve] Pruned history: ${String(deps.history.length)} -> ${String(historySlice.length)} messages`)
	}

	// 4. Call the LLM with the canonical schema.
	let action: Action
	try {
		const response = await complete({
			provider: deps.provider,
			config: deps.config,
			messages: [
				{ role: "system", content: SYSTEM_PROMPT },
				...historySlice,
				{ role: "user", content: userMessage },
			],
			schema: resolveStepResponseSchema,
			schemaName: RESOLVE_STEP_SCHEMA_NAME,
		})
		action = response
	} catch (err) {
		// Context-length recovery: clear history and retry with a fresh full message.
		// Only matches genuine context-overflow phrasings. Avoids JSON property names
		// like "contextWindow" or "input_tokens" that show up in error metadata dumps.
		const isContextOverflow = err instanceof LLMApiError && (
			/\bcontext length\b|\bprompt is too long\b|\bcontext_length_exceeded\b|\binput length and `?max_tokens`? exceed/i
				.test(err.message)
		)
		if (isContextOverflow) {
			console.log(`Context length exceeded, clearing history and retrying. Original error: ${err.message}`)
			const freshMessage = buildUserMessage(step, pageState)
			const response = await complete({
				provider: deps.provider,
				config: deps.config,
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					{ role: "user", content: freshMessage },
				],
				schema: resolveStepResponseSchema,
				schemaName: RESOLVE_STEP_SCHEMA_NAME,
			})
			action = response
			deps.cache.set(cacheKey, action)
			return {
				action,
				newHistory: [
					{ role: "user", content: freshMessage },
					{ role: "assistant", content: JSON.stringify(action) },
				],
				newPrevPageState: pageState,
				newPrevFormattedTree: formatA11yTree(pageState.a11yTree),
			}
		}
		throw err
	}

	// 5. Cache and return.
	deps.cache.set(cacheKey, action)
	return {
		action: action,
		newHistory: [
			...deps.history,
			{ role: "user", content: userMessage },
			{ role: "assistant", content: JSON.stringify(action) },
		],
		newPrevPageState: pageState,
		newPrevFormattedTree: formatA11yTree(pageState.a11yTree),
	}
}
