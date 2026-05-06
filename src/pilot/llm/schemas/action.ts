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

// ─── Shared field constants ───────────────────────────────────────────────
//
// Targeting fields and identifier patterns are reused across variants.
// Each carries its own `.describe()` so the model sees field-level guidance
// at decode time, plus a regex pattern where the value space is constrained.

const refField = z.string()
	.regex(/^e\d+$/)
	.describe("Stable element ref from the accessibility tree, e.g. 'e1', 'e2'. ALWAYS prefer this over 'text' when the element appears in the tree.")
	.optional()

const textField = z.string()
	.describe("Visible text on the element. Use ONLY as a last resort when the element is genuinely not in the accessibility tree.")
	.optional()

const testidField = z.string()
	.describe("Value of the element's data-testid attribute. Useful for hidden elements like file inputs where 'ref' is unreliable.")
	.optional()

const rememberAsField = z.string()
	.regex(/^[a-z][a-z0-9_]*$/)
	.describe("Snake_case identifier (lowercase letters, digits, underscore; must start with a letter). Used by later 'compare' clauses to refer back to this captured value.")

/** Click an element. Targets via `ref` (preferred), `text`, or `testid`. */
const click = z.object({
	action: z.literal("click"),
	ref: refField,
	text: textField,
	testid: testidField,
}).describe("Single left-click on an element. For checkboxes or toggles use 'check' / 'uncheck' instead.")

/** Tick a checkbox or toggle into the on state. */
const check = z.object({
	action: z.literal("check"),
	ref: refField,
	text: textField,
	testid: testidField,
}).describe("Tick a checkbox or set a toggle to the ON state. Idempotent: a no-op if the element is already checked.")

/** Untick a checkbox or toggle into the off state. */
const uncheck = z.object({
	action: z.literal("uncheck"),
	ref: refField,
	text: textField,
	testid: testidField,
}).describe("Untick a checkbox or set a toggle to the OFF state. Idempotent: a no-op if the element is already unchecked.")

/** Type into a text input or textarea. `value` is the text to type. */
const type_ = z.object({
	action: z.literal("type"),
	ref: refField,
	text: textField,
	testid: testidField,
	value: z.string().describe("The literal text to type into the field. The runtime clears the field first then types this value."),
}).describe("Type text into an input or textarea. Do NOT use for native <select> elements (use 'select') or autocomplete widgets (use 'autocomplete').")

/**
 * Empty a field, filter, or selection. Targets the field by `ref` / `text` /
 * `testid`. The runtime decides whether to select-all-and-delete or to find
 * a clear/remove/reset button nearby, depending on field type.
 */
const clear = z.object({
	action: z.literal("clear"),
	ref: refField,
	text: textField,
	testid: testidField,
}).describe("Empty a field, filter, or selection. Use for steps that say 'clear', 'reset', or 'remove'. The runtime auto-detects whether to select-all-and-delete or click a clear button.")

/** Pick `option` from a `<select>` dropdown. */
const select = z.object({
	action: z.literal("select"),
	ref: refField,
	text: textField,
	testid: testidField,
	option: z.string().describe("The option label as it appears in the dropdown."),
}).describe("Pick an option from a native <select> dropdown. For combobox / autocomplete widgets use 'autocomplete' instead.")

/**
 * Type into an autocomplete-style field and pick a suggestion. The runtime
 * types `value` as the search query and selects the matching `option` from
 * the suggestion list (defaulting to the first suggestion if `option` is omitted).
 */
const autocomplete = z.object({
	action: z.literal("autocomplete"),
	ref: refField,
	text: textField,
	testid: testidField,
	value: z.string().describe("The search query to type into the autocomplete field."),
	option: z.string().describe("The suggestion to pick from the dropdown. Omit to pick the first suggestion.").optional(),
}).describe("Type into an autocomplete / combobox field and pick a suggestion. Use this when the page renders a suggestion list as the user types, not a native <select>.")

/**
 * Scroll the page. `value` is the direction (`"up"` / `"down"` / `"top"` /
 * `"bottom"`) or a target description like `"to the footer"`.
 */
const scroll = z.object({
	action: z.literal("scroll"),
	value: z.string().describe("Either a page-level direction ('up', 'down', 'top', 'bottom') or a free-form description of a target to scroll into view."),
}).describe("Scroll the page or scroll a specific element into view.")

/** Navigate to a URL. `value` is the destination URL. */
const navigate = z.object({
	action: z.literal("navigate"),
	value: z.string()
		.regex(/^(https?:\/\/|\/)/)
		.describe("Absolute URL (starting with 'http://' or 'https://') or absolute path (starting with '/'). For 'go to the X page' steps use a 'click' action instead."),
}).describe("Navigate the browser to an explicit URL or absolute path. Only use for literal URLs/paths; never for clicking links described by name.")

/** Press a keyboard key. `value` is the key name (e.g. `"Enter"`, `"Tab"`). */
const press = z.object({
	action: z.literal("press"),
	value: z.string().describe("Key name in Playwright syntax, e.g. 'Enter', 'Tab', 'Escape', 'Control+A', 'Meta+a'."),
}).describe("Press a single keyboard key on the focused element.")

/**
 * Wait for the page to settle, optionally for a specific text or duration.
 * `value` is omitted for a generic settle, or set to a duration (`"500ms"`)
 * or a text-to-wait-for.
 */
const wait = z.object({
	action: z.literal("wait"),
	value: z.string().describe("Optional duration like '500ms' or a free-form text to wait for. Omit for a generic 'wait until the page settles'.").optional(),
}).describe("Wait for the page to settle, a duration to elapse, or a text to appear. Use sparingly — most actions auto-wait.")

/** Upload a file to a file input. `value` is the file path. */
const upload = z.object({
	action: z.literal("upload"),
	ref: refField,
	text: textField,
	testid: testidField,
	value: z.string().describe("Path to the file to upload, relative to the test fixtures directory. For multiple files separate paths with a comma."),
}).describe("Upload one or more files to a file input. Prefer 'testid' over 'ref' for hidden file inputs.")

/**
 * Verify something about the page. Carries an `assertion` payload (which
 * check + expected value) and optionally a `compare` clause for value-vs-value
 * comparisons.
 */
const assert_ = z.object({
	action: z.literal("assert"),
	assertion: assertionSchema,
	ref: z.string()
		.regex(/^e\d+$/)
		.describe("Optional element ref for assertion types that need a specific target. Same format as the targeting 'ref' on other actions.")
		.optional(),
	compare: compareSchema
		.describe("Required when assertion.type is 'compare' (numeric comparison) or 'contains_remembered' (page contains a remembered value). Omit for all other assertion types.")
		.optional(),
}).describe("Verify a property of the page. The 'assertion' field selects which check to perform; some checks require additional fields (see assertion description).")

/**
 * Capture a value from the page into a named variable for later comparison.
 * The runtime reads the targeted element's text and stores it under
 * `rememberAs` in the variable bag.
 */
const remember = z.object({
	action: z.literal("remember"),
	ref: refField,
	text: textField,
	rememberAs: rememberAsField,
}).describe("Capture an element's text into a named variable. Read later by 'compare' or 'contains_remembered' assertions.")

/**
 * Count the number of elements on the page matching the targeting fields and
 * store the count under `rememberAs`. Useful with later `assert + compare`
 * to verify "at least N items" or similar.
 */
const count = z.object({
	action: z.literal("count"),
	ref: refField,
	text: textField,
	rememberAs: rememberAsField,
}).describe("Count elements matching the targeting fields and store the count (an integer) under a named variable.")

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
]).describe("A single browser action the runtime can execute. The 'action' discriminator selects the variant; each variant carries only its meaningful fields.")

/** Inferred TypeScript type for {@link actionSchema}. */
export type Action = z.infer<typeof actionSchema>

/**
 * Stable identifier providers use to refer to this schema:
 * the OpenAI tool name in `response_format.json_schema.name` and the
 * Anthropic tool name in `tools[0].name`. Snake_case to match common API
 * conventions.
 */
export const ACTION_SCHEMA_NAME = "action"

