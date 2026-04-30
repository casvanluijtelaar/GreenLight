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

/**
 * Discriminated union over the `action` field. Each variant carries only
 * the fields valid for that action type. The discriminator prevents
 * illegal combinations (e.g. value on click, ref on press).
 *
 * Variant list comes from VALID_ACTIONS in src/pilot/response-parser.ts.
 */

const click = z.object({
	action: z.literal("click"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

const check = z.object({
	action: z.literal("check"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

const uncheck = z.object({
	action: z.literal("uncheck"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

const type_ = z.object({
	action: z.literal("type"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	value: z.string(),
})

const clear = z.object({
	action: z.literal("clear"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
})

const select = z.object({
	action: z.literal("select"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	option: z.string(),
})

const autocomplete = z.object({
	action: z.literal("autocomplete"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	value: z.string(),
	option: z.string().optional(),
})

const scroll = z.object({
	action: z.literal("scroll"),
	value: z.string(),   // direction: up | down | left | right
})

const navigate = z.object({
	action: z.literal("navigate"),
	value: z.string(),   // URL
})

const press = z.object({
	action: z.literal("press"),
	value: z.string(),   // key name
})

const wait = z.object({
	action: z.literal("wait"),
	value: z.string().optional(),   // optional duration / text-to-wait-for
})

const upload = z.object({
	action: z.literal("upload"),
	ref: z.string().optional(),
	text: z.string().optional(),
	testid: z.string().optional(),
	value: z.string(),   // file path
})

const assert_ = z.object({
	action: z.literal("assert"),
	assertion: assertionSchema,
	ref: z.string().optional(),
	compare: compareSchema.optional(),
})

const remember = z.object({
	action: z.literal("remember"),
	ref: z.string().optional(),
	text: z.string().optional(),
	as: z.string(),
})

const count = z.object({
	action: z.literal("count"),
	ref: z.string().optional(),
	text: z.string().optional(),
	as: z.string(),
})

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

export type Action = z.infer<typeof actionSchema>

/** Stable name used by providers that require one (OpenAI tool name, Anthropic tool name). */
export const ACTION_SCHEMA_NAME = "action"
