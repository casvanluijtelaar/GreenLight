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

import type { Page } from "playwright"
import type { ChatMessage, LLMProvider, ProviderConfig } from "../provider.js"
import { complete } from "../complete.js"
import {
	expandStepResponseSchema,
	EXPAND_STEP_SCHEMA_NAME,
	type PlannedStep,
} from "../schemas/index.js"
import { formatA11yTree } from "../../a11y-parser.js"
import { captureFormFields, formatFormFields } from "../../form-fields.js"
import type { PageState } from "../../../reporter/types.js"
import { globals } from "../../../globals.js"

const EXPAND_SYSTEM_PROMPT = `You are expanding a high-level test step into concrete atomic actions based on the actual form fields visible on the page.

You receive:
1. The original step instruction (which may specify some values explicitly).
2. The accessibility tree of the current page (with element refs).
3. A detailed list of form fields with label, placeholder, input type, required status, and options.

═══ Autocomplete fields ═══

Fields marked [autocomplete] are typeahead/combobox fields. Default to the first suggestion unless the step names a specific choice. Type a short search term likely to produce results.

═══ Test data ═══

- Explicit values in the step -> use EXACTLY (match by field purpose, not label language).
- Unspecified fields -> generate realistic fake data based on label, placeholder, and input type.
  - Use input type (email, tel, url, number) to pick the right format.
  - For free-text/message fields -> "Test message".
- Select/dropdown -> first non-empty option unless specified.
- Checkboxes -> check if needed (especially consent/terms checkboxes).
- Required fields -> always fill. Optional fields -> fill too.
- "Submit" in the step -> include a click on the submit button as the last action.
`

export interface ExpandStepDeps {
	provider: LLMProvider
	config: ProviderConfig
	history: ChatMessage[]
}

export interface ExpandStepResult {
	steps: PlannedStep[]
	newHistory: ChatMessage[]
}

export async function expandStep(
	step: string,
	pageState: PageState,
	page: Page,
	deps: ExpandStepDeps,
): Promise<ExpandStepResult> {
	const tree = formatA11yTree(pageState.a11yTree)
	const formFields = await captureFormFields(page)
	const formFieldsText = formatFormFields(formFields)

	if (globals.debug) {
		console.log(
			`\n      [expand] Detected ${String(formFields.length)} form fields:`,
		)
		for (const f of formFields) {
			const parts: string[] = [`        <${f.tag}>`]
			if (f.label) parts.push(`label="${f.label}"`)
			if (f.placeholder) parts.push(`placeholder="${f.placeholder}"`)
			parts.push(`type="${f.inputType}"`)
			if (f.required) parts.push("[required]")
			if (f.autocomplete) parts.push("[autocomplete]")
			if (f.options && f.options.length > 0) {
				parts.push(
					`options: [${f.options
						.slice(0, 5)
						.map((o) => `"${o}"`)
						.join(", ")}${f.options.length > 5 ? ", ..." : ""}]`,
				)
			}
			console.log(parts.join(" "))
		}
		const autoFields = formFields.filter((f) => f.autocomplete)
		if (autoFields.length > 0) {
			console.log(
				`      [expand] ${String(autoFields.length)} autocomplete field(s) detected`,
			)
		}
	}

	const userMessage = [
		`Original step: ${step}`,
		"",
		`Current URL: ${pageState.url}`,
		`Page title: ${pageState.title}`,
		"",
		"Accessibility tree:",
		tree,
		"",
		"Form fields on the page (with label, placeholder, type, and options):",
		formFieldsText,
	].join("\n")

	const response = await complete({
		provider: deps.provider,
		config: deps.config,
		messages: [
			{ role: "system", content: EXPAND_SYSTEM_PROMPT },
			{ role: "user", content: userMessage },
		],
		schema: expandStepResponseSchema,
		schemaName: EXPAND_STEP_SCHEMA_NAME,
	})

	if (globals.debug) {
		console.log(
			`      [expand] Parsed into ${String(response.steps.length)} sub-steps:`,
		)
		for (const es of response.steps) {
			const label = "action" in es ? JSON.stringify(es.action) : "(needs page)"
			console.log(`        - ${es.step} -> ${label}`)
		}
	}

	return {
		steps: response.steps,
		newHistory: [
			...deps.history,
			{ role: "user", content: `Expanded step: ${step}\nResult:\n${JSON.stringify(response)}` },
			{ role: "assistant", content: "OK, form has been filled and submitted." },
		],
	}
}
