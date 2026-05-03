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
import { assertionSchema } from "./assertion.js"
import { compareSchema } from "./compare.js"

// ─── Variant categories ───────────────────────────────────────────────────
//
// Element-targeting (carry `ref` / `text` / `testid`, no value):
//   click, check, uncheck, clear
// Element-targeting + value:
//   type (value), select (option), autocomplete (value, optional option),
//   upload (value as file path)
// Page-level (no targeting, only value):
//   scroll, navigate, press, wait
// State-recording (targeting + variable name):
//   remember, count
// Verification:
//   assert (assertion payload + optional compare clause)

/** Click an element. Targets via `ref` (preferred), `text`, or `testid`. */
const click = z.object({
	action: z.literal("click"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

/** Tick a checkbox or toggle into the on state. */
const check = z.object({
	action: z.literal("check"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

/** Untick a checkbox or toggle into the off state. */
const uncheck = z.object({
	action: z.literal("uncheck"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

/** Type into a text input or textarea. `value` is the text to type. */
const type_ = z.object({
	action: z.literal("type"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	/** The text to type into the field. */
	value: z.string(),
})

/**
 * Empty a field, filter, or selection. Targets the field by `ref` / `text` /
 * `testid`. The runtime decides whether to select-all-and-delete or to find
 * a clear/remove/reset button nearby, depending on field type.
 */
const clear = z.object({
	action: z.literal("clear"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

/** Pick `option` from a `<select>` dropdown. */
const select = z.object({
	action: z.literal("select"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	/** The option to choose. */
	option: z.string(),
})

/**
 * Type into an autocomplete-style field and pick a suggestion. The runtime
 * types `value` as the search query and selects the matching `option` from
 * the suggestion list (defaulting to the first suggestion if `option` is omitted).
 */
const autocomplete = z.object({
	action: z.literal("autocomplete"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	/** The search text to type into the field. */
	value: z.string(),
	/** Which suggestion to pick. Defaults to the first if omitted. */
	option: z.string().optional(),
})

/**
 * Scroll the page. `value` is the direction (`"up"` / `"down"` / `"top"` /
 * `"bottom"`) or a target description like `"to the footer"`.
 */
const scroll = z.object({
	action: z.literal("scroll"),
	/** Scroll direction: `up`, `down`, `top`, `bottom`, or a description. */
	value: z.string(),
})

/** Navigate to a URL. `value` is the destination URL. */
const navigate = z.object({
	action: z.literal("navigate"),
	/** The URL to navigate to. */
	value: z.string(),
})

/** Press a keyboard key. `value` is the key name (e.g. `"Enter"`, `"Tab"`). */
const press = z.object({
	action: z.literal("press"),
	/** Key name to press; uses Playwright key syntax (e.g. `Enter`, `Control+A`). */
	value: z.string(),
})

/**
 * Wait for the page to settle, optionally for a specific text or duration.
 * `value` is omitted for a generic settle, or set to a duration (`"500ms"`)
 * or a text-to-wait-for.
 */
const wait = z.object({
	action: z.literal("wait"),
	/** Optional duration (e.g. `500ms`) or text-to-wait-for. */
	value: z.string().optional(),
})

/** Upload a file to a file input. `value` is the file path. */
const upload = z.object({
	action: z.literal("upload"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	/** Path to the file to upload. Multiple files supported via comma-separated paths. */
	value: z.string(),
})

/**
 * Verify something about the page. Carries an `assertion` payload (which
 * check + expected value) and optionally a `compare` clause for value-vs-value
 * comparisons.
 */
const assert_ = z.object({
	action: z.literal("assert"),
	/** Which assertion to perform. See {@link assertionSchema}. */
	assertion: assertionSchema,
	/** Optional element ref for assertions that need a specific target. */
	ref: z.string().optional(),
	/** Optional compare clause for value-vs-value assertions. See {@link compareSchema}. */
	compare: compareSchema.optional(),
})

/**
 * Capture a value from the page into a named variable for later comparison.
 * The runtime reads the targeted element's text and stores it under
 * `rememberAs` in the variable bag.
 */
const remember = z.object({
	action: z.literal("remember"),
	ref: z.string().optional(),
	text: z.string().optional(),
	/** Name to store the captured value under. Read by later `compare` clauses. */
	rememberAs: z.string(),
})

/**
 * Count the number of elements on the page matching the targeting fields and
 * store the count under `rememberAs`. Useful with later `assert + compare`
 * to verify "at least N items" or similar.
 */
const count = z.object({
	action: z.literal("count"),
	ref: z.string().optional(),
	text: z.string().optional(),
	/** Name to store the count under. Read by later `compare` clauses. */
	rememberAs: z.string(),
})

/**
 * The 15 actions the executor knows how to perform on a page, expressed as a
 * Zod discriminated union over the literal `action` field.
 *
 * Each variant carries only the fields meaningful for that action type. The
 * discriminator prevents illegal combinations: an LLM cannot emit
 * `{ action: "click", value: "x" }` because `click` does not declare a
 * `value` field. Providers with strict-mode JSON Schema (OpenAI, Gemini) and
 * Anthropic's tool-use mechanism enforce this at the API level.
 */
export const actionSchema = z.discriminatedUnion("action", [
	click,
	check,
	uncheck,
	type_,
	clear,
	select,
	autocomplete,
	scroll,
	navigate,
	press,
	wait,
	upload,
	assert_,
	remember,
	count,
])

/** Inferred TypeScript type for {@link actionSchema}. */
export type Action = z.infer<typeof actionSchema>

/**
 * Stable identifier providers use to refer to this schema:
 * the OpenAI tool name in `response_format.json_schema.name` and the
 * Anthropic tool name in `tools[0].name`. Snake_case to match common API
 * conventions.
 */
export const ACTION_SCHEMA_NAME = "action"
