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

import type { RunConfig } from "../../types.js"
import { resolveModelConfig } from "../../types.js"
import { createProvider } from "./providers/index.js"
import type { LLMClientConfig } from "./index.js"

/** Resolve the API key from environment variables. */
export function resolveApiKey(): string {
	const key = process.env.LLM_API_KEY ?? process.env.OPENROUTER_API_KEY
	if (!key) {
		throw new Error("No API key found. Set LLM_API_KEY or OPENROUTER_API_KEY environment variable.")
	}
	return key
}

/** Resolve LLM client config from RunConfig and environment. */
export function resolveLLMConfig(runConfig: RunConfig): LLMClientConfig {
	const modelConfig = resolveModelConfig(runConfig.model)
	const provider = createProvider(runConfig.provider, runConfig.llmBaseUrl)
	return {
		// claude-cli uses the local claude CLI (OAuth), not an API key.
		apiKey: runConfig.provider === "claude-cli" ? "" : resolveApiKey(),
		provider,
		plannerModel: modelConfig.planner,
		pilotModel: modelConfig.pilot,
	}
}
