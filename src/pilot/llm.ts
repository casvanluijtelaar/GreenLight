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
 * Provider-agnostic LLM client.
 *
 * Re-export shim: all real code lives under src/pilot/llm/. This file is
 * kept so existing imports in pilot.ts, plan-runner.ts, etc., don't have
 * to change in this commit. It will be removed once those imports are
 * migrated to the new path in Phase D/E.
 */

export type { LLMClient, LLMClientConfig } from "./llm/index.js"
export { createLLMClient } from "./llm/index.js"
export type { ChatMessage } from "./llm/index.js"
export { resolveApiKey, resolveLLMConfig } from "./llm-config.js"
