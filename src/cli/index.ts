#!/usr/bin/env node

import "dotenv/config"
import { Command } from "commander"
import { DEFAULTS, type RunConfig } from "../types.js"
import { loadSuite } from "../parser/loader.js"
import {
	launchBrowser,
	createContext,
	createPage,
	closeBrowser,
	toBrowserOptions,
} from "../browser/browser.js"
import { attachConsoleCollector } from "../pilot/state.js"
import { resolveLLMConfig, createLLMClient } from "../pilot/llm.js"
import { runTestCase } from "../pilot/pilot.js"
import { resolve } from "node:path"
import { glob } from "node:fs"

const program = new Command()

program
	.name("greenlight")
	.description("AI-driven E2E testing tool")
	.version("0.1.0")

program
	.command("run")
	.description("Run test suites against a staging environment")
	.argument("[suites...]", "paths to suite YAML files", ["./tests/**/*.yaml"])
	.option("-t, --test <name>", "run only the test case matching this name")
	.option("--base-url <url>", "override the suite base URL")
	.option(
		"-r, --reporter <format>",
		"output format: cli, json, or html",
		DEFAULTS.reporter,
	)
	.option("-o, --output <path>", "write report to file instead of stdout")
	.option("--headed", "run browser in visible (headed) mode", DEFAULTS.headed)
	.option(
		"-p, --parallel <n>",
		"number of test cases to run concurrently",
		String(DEFAULTS.parallel),
	)
	.option(
		"--timeout <ms>",
		"per-step timeout in milliseconds",
		String(DEFAULTS.timeout),
	)
	.option(
		"--model <model>",
		"LLM model identifier (e.g. anthropic/claude-sonnet-4)",
		DEFAULTS.model,
	)
	.option(
		"--llm-base-url <url>",
		"base URL for the OpenAI-compatible LLM API",
		DEFAULTS.llmBaseUrl,
	)
	.option("--debug", "enable verbose debug output", false)
	.action(
		async (
			suites: string[],
			opts: {
				test?: string
				baseUrl?: string
				reporter: string
				output?: string
				headed: boolean
				parallel: string
				timeout: string
				model: string
				llmBaseUrl: string
				debug: boolean
			},
		) => {
			const config: RunConfig = {
				suiteFiles: suites.map((s) => resolve(s)),
				testFilter: opts.test,
				baseUrl: opts.baseUrl,
				reporter: parseReporter(opts.reporter),
				outputPath: opts.output ? resolve(opts.output) : undefined,
				headed: opts.headed,
				parallel: parseInt(opts.parallel, 10),
				timeout: parseInt(opts.timeout, 10),
				viewport: { ...DEFAULTS.viewport },
				model: opts.model,
				llmBaseUrl: opts.llmBaseUrl,
			}

			// Resolve glob patterns in suite file paths
			const resolvedFiles = await resolveGlobs(config.suiteFiles)

			if (resolvedFiles.length === 0) {
				console.error("No suite files found matching:", config.suiteFiles)
				process.exit(1)
			}

			// Load and run each suite
			for (const file of resolvedFiles) {
				try {
					const suite = await loadSuite(file)

					// Apply CLI overrides
					if (config.baseUrl) {
						suite.base_url = config.baseUrl
					}

					// Apply suite-level model override
					const effectiveModel = suite.model ?? config.model

					console.log(`\nSuite: ${suite.suite}`)
					console.log(`URL:   ${suite.base_url}`)
					console.log(`Model: ${effectiveModel}`)

					// Create LLM client
					const llmConfig = resolveLLMConfig({
						...config,
						model: effectiveModel,
					})
					const llm = createLLMClient(llmConfig)

					// Launch browser
					const browserOpts = toBrowserOptions(config)
					const browser = await launchBrowser(browserOpts)

					try {
						// Filter tests
						const tests = config.testFilter
							? suite.tests.filter((t) => t.name === config.testFilter)
							: suite.tests

						for (const test of tests) {
							console.log(`\n  Test: ${test.name}`)

							// Fresh context per test case
							const context = await createContext(browser, browserOpts)
							const page = await createPage(context)
							const { drain } = attachConsoleCollector(page)

							await page.goto(suite.base_url)

							const result = await runTestCase(page, test, llm, {
								timeout: config.timeout,
								consoleDrain: drain,
								debug: opts.debug,
							})

							// Print step-by-step results
							for (const stepResult of result.steps) {
								const icon =
									stepResult.status === "passed"
										? "\x1b[32m\u2713\x1b[0m"
										: "\x1b[31m\u2717\x1b[0m"
								const dur = `${String(Math.round(stepResult.duration))}ms`
								const t = stepResult.timing
								const phases = t
									? ` \x1b[90m[capture:${String(Math.round(t.capture))} llm:${String(Math.round(t.llm))} exec:${String(Math.round(t.execute))} post:${String(Math.round(t.postCapture))}ms]\x1b[0m`
									: ""
								console.log(`    ${icon} ${stepResult.step} (${dur})${phases}`)
								if (stepResult.error) {
									console.log(`      \x1b[31m${stepResult.error}\x1b[0m`)
								}
								if (opts.debug && stepResult.action) {
									console.log(
										`      Action: ${JSON.stringify(stepResult.action)}`,
									)
								}
							}

							// Summary for this test
							const testIcon =
								result.status === "passed"
									? "\x1b[32mPASSED\x1b[0m"
									: "\x1b[31mFAILED\x1b[0m"
							console.log(
								`\n  ${testIcon} (${String(Math.round(result.duration))}ms)`,
							)

							if (config.headed) {
								await new Promise((r) => setTimeout(r, 2000))
							}

							await context.close()
						}
					} finally {
						await closeBrowser(browser)
					}
				} catch (err) {
					console.error(`\nFailed to load suite: ${file}`)
					if (err instanceof Error) {
						console.error(err.message)
					}
					process.exit(1)
				}
			}
		},
	)

function parseReporter(value: string): RunConfig["reporter"] {
	if (value === "cli" || value === "json" || value === "html") {
		return value
	}
	console.error(`Invalid reporter "${value}". Must be cli, json, or html.`)
	process.exit(1)
}

/** Expand glob patterns into concrete file paths. */
async function resolveGlobs(patterns: string[]): Promise<string[]> {
	const files: string[] = []
	for (const pattern of patterns) {
		// If pattern has no glob chars, treat as literal path
		if (!pattern.includes("*")) {
			files.push(pattern)
			continue
		}
		const matches = await new Promise<string[]>((res, rej) => {
			glob(pattern, (err, result) => {
				if (err) rej(err)
				else res(result)
			})
		})
		files.push(...matches)
	}
	return files
}

program.parse()
