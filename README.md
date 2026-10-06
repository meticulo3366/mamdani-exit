# The Mamdani Exit

Deciding whether to leave NYC? This calculator compares what you actually keep — after **federal, state, and city taxes**, housing, cars, and cost of living — across US cities, using real **2026 progressive tax brackets** (not flat approximations).

**Live page:** https://meticulo3366.github.io/mamdani-exit/

## For agents (ChatGPT, Claude, or any LLM)

The calculator is machine-usable — static files only, open CORS, no backend ([full docs](API.md), [llms.txt](llms.txt)):

- **[engine.js](https://meticulo3366.github.io/mamdani-exit/engine.js)** — the tested engine as a dependency-free CommonJS/browser module; fetch it and call `compareCities` / `calcRvo` for exact answers
- **[api.html](https://meticulo3366.github.io/mamdani-exit/api.html)** — URL-parameter JSON endpoint for browser-driving agents (`api.html?mode=cities&gross=150000`); the page body becomes a JSON document
- **[data.json](https://meticulo3366.github.io/mamdani-exit/data.json)** — the verified tax dataset for clients that can't run JS
- **[mcp-server.js](https://meticulo3366.github.io/mamdani-exit/mcp-server.js)** — zero-dependency MCP server (stdio): clone the repo and register `node mcp-server.js` in Claude Desktop/Code, ChatGPT desktop, or Cursor. Tools: `compare_cities`, `rent_vs_own_nyc`, `get_tax_data`

Run the test suites with `node test/engine.test.js` (94 checks) and `node test/mcp.test.js`.

## What it models

- 2026 federal brackets & standard deduction (post-OBBBA), SALT cap with high-income phase-down, auto standard-vs-itemized
- FICA: $184,500 Social Security wage base + 0.9% additional Medicare
- Progressive state brackets with state-specific deductions — including **NY's tax-benefit recapture**, which most calculators skip
- NYC resident brackets, CA mental-health surtax + uncapped SDI, MA millionaire surtax, Philadelphia wage tax
- First-year **NY nonresident tax on bonuses** earned from NY workdays, net of the new state's resident credit
- Cars (NYC defaults to zero) + transit passes as an explicit transportation line
- **Regional & rural presets 1–1.5 hr out** — Hudson Valley, NJ/CT commuter belt (with rail-pass costs and NY's convenience-of-employer rule for kept NYC jobs), plus satellite towns for every metro (Providence, Lancaster, Fort Collins, Tacoma, Athens, and more)

Every rate lives in an editable JSON panel — when new brackets drop, paste them in. Settings persist in your browser (localStorage); nothing is sent anywhere.

## Disclaimer

Not tax advice. Rates verified July 2026 against IRS Rev. Proc. 2025-32, Tax Foundation, and SSA published figures. Rents and cost indexes are editable placeholders — bring your own quotes. Talk to a CPA before timing a move around a bonus payout.
