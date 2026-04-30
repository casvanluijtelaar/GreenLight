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

/**
 * Provider re-exports. The actual implementations live in src/pilot/providers/
 * during the migration; they will be moved here in Phase E as part of the cleanup.
 */
export { createOpenAICompatibleProvider } from "../../providers/openai-compatible.js"
export { createAnthropicProvider } from "../../providers/anthropic.js"
export { createGeminiProvider } from "../../providers/gemini.js"
export { createClaudeCodeProvider } from "../../providers/claude-code.js"
export { createProvider } from "../../providers/index.js"
