# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-03-17

### Added

- **Map testing support** — pluggable adapter architecture for testing pages with interactive WebGL maps. Write steps like `check that the map shows "Stockholm"` and GreenLight queries the map's actual rendered features (place names, road labels, etc.) from vector tile data.
- **MapLibre GL JS adapter** — automatic map instance detection via React fiber tree walking, Vue internals, global variable scanning, and explicit `window.__greenlight_map` exposure.
- **`MAP_DETECT` planner step** — automatically inserted before map-related steps. Fails the test early if no supported map is found.
- **`map_state` assertion type** — evaluates conditions against the map's rendered features (name search), viewport state (zoom level checks), and layer visibility. Works in both discovery and cached plan runs.
- **`queryRenderedFeatures` adapter method** — queries all features visible in the map viewport, used by map assertions to verify map content without coordinates.
- **75% browser zoom in headed mode** via the `playwright-zoom` extension for a better visual overview during test development.
- **Multi-provider LLM support** — native integrations for OpenRouter, OpenAI, Google Gemini, and Anthropic Claude. Configure via `provider` in `greenlight.yaml` or `--provider` CLI flag. Separate planner/pilot model selection for balancing quality and cost.
- **LLM API error abort** — 4xx and 5xx responses from any LLM provider now abort the entire test run immediately instead of failing individual steps.

### Changed

- **`X-E2E-Test` header is now same-origin only** — previously added to all requests via `extraHTTPHeaders`, which triggered CORS preflight failures on cross-origin tile servers and CDNs. Now injected per-request via route interception, only on same-origin navigation, fetch, and XHR requests.
- **Headed mode uses persistent browser context** — required for the zoom extension, with pages closed between tests instead of full context teardown.
- **Remember action fallback** — when the LLM targets an element for a `remember` action but the variable name implies a number and the captured text has none, the executor falls back to keyword search in the accessibility tree.

### Fixed

- Cross-origin map tile requests (e.g. PMTiles on DigitalOcean Spaces) no longer fail due to CORS preflight triggered by the `X-E2E-Test` header.

## [0.1.0] - 2026-03-17

Initial NPM release.
