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

import { describe, it, expect } from "vitest"
import { pruneHistory } from "../../../src/pilot/llm/history.js"

describe("pruneHistory", () => {
	it("returns history unchanged when within budget", () => {
		const history = [
			{ role: "user" as const, content: "hi" },
			{ role: "assistant" as const, content: "hello" },
		]
		const { history: result } = pruneHistory({ systemPrompt: "sys", userMessage: "user", history })
		expect(result).toBe(history)
	})

	it("drops oldest pair when over budget", () => {
		const big = "x".repeat(200_000)
		const history = [
			{ role: "user" as const, content: big },
			{ role: "assistant" as const, content: big },
			{ role: "user" as const, content: big },
			{ role: "assistant" as const, content: big },
		]
		const { history: result } = pruneHistory({ systemPrompt: "sys", userMessage: "user", history })
		expect(result.length).toBeLessThan(history.length)
	})
})
