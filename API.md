# The Mamdani Exit — Agent API

NYC cost-of-living, tax, and rent-vs-own calculator with **verified 2026 tax data**
(IRS Rev. Proc. 2025-32 post-OBBBA, state DORs, tax.ny.gov, nyc.gov). Static GitHub Pages site —
**all computation is client-side JavaScript; there is no backend.** Amounts USD/year unless noted.
Not tax advice.

Pick the interface that matches your abilities:

| You can… | Use |
|---|---|
| Execute JS (sandbox or Node) | **`engine.js`** — exact answers, full fidelity |
| Drive a browser (agent mode) | **`api.html?…`** — page body becomes JSON |
| Only fetch text | **`data.json`** — raw verified data; compute carefully |
| Speak MCP | **`mcp-server.js`** — run locally, 3 tools |

All files live at `https://meticulo3366.github.io/mamdani-exit/` and are served with
`Access-Control-Allow-Origin: *`.

## 1. engine.js (recommended)

CommonJS module / browser global `NYCEXIT`. No dependencies. Node ≥16.

```js
const E = require("./engine.js"); // or <script src=".../engine.js"> → window.NYCEXIT

// Rank cities by discretionary income (take-home − housing − transport − living costs)
E.compareCities({ gross: 150000, status: "single" }, null, ["nyc", "miami", "austin"]);

// NYC rent-vs-own: co-op whose letter says 60% of maintenance is deductible
E.calcRvo({ price: 800000, type: "coop", coopDedPct: 60, coopIntPct: 10,
            maintMo: 2400, rentMo: 3800, rate: 6.0, termYrs: 30 },
          { gross: 150000, status: "single" }, null);
```

Passing `null` for `data` uses the built-in verified dataset (`E.DEFAULT_DATA`); pass a modified
copy to override any bracket or rate. Unlisted params take `E.DEFAULT_INPUTS` / `E.DEFAULT_RVO`
defaults.

### Income/lifestyle params (`inputs`) — both tools
`gross` (100000) · `status` "single"|"mfj" · `bonusPct` (40) · `k401` (0) · `spend` $/mo non-housing
(3000) · `carCost` $/mo per car (750) · `propTax` $/yr non-NYC-tab itemizing (0) · `otherItem` (0) ·
`nySrc` first-year NY-sourced bonus (false) · `nycJob` NY convenience-of-employer rule for NJ/CT belt
(false) · `inPerson` price commute time (false) · `commuteDays` (3) · `timeValue` $/hr (25)

### compareCities / calcCity output
Per city: `disc` (discretionary $/yr), `deltaVsBaseline` (vs NYC), `totalTax`, `effRate`, `fed`,
`ss`+`medicare`, `state`, `cityTax`, `payroll`, `nyExtra`, `nyCommute`, `takeHome`, `housing`,
`transport`, `otherCOL`, `timeCost`, `usedItemized`. City ids: `Object.keys(E.DEFAULT_DATA.cities)`.

### calcRvo params (`rvo`)
`price` (800000) · `type` "condo"|"coop"|"house" · `downPct` (20) · `rate` % (6.0) · `termYrs`
10|15|20|30 · `maintMo` (1200; co-op: taxes included) · `ptaxAnnual` condo/house (7200; ~0.9% of
value typical) · `abatePct` (17.5; tiers 28.1/25.2/22.5/17.5 by assessed value, primary residence) ·
`coopDedPct` combined deductible % from the building's §216 letter (60) · `coopIntPct` slice that is
building mortgage interest, deducts outside the SALT cap (10) · `rentMo` (3800) · `rentGrowPct` (3;
rent-stabilized 2026-27 renewals frozen at 0) · `apprPct` (3) · `invPct` renter return (7) ·
`horizonYrs` (10) · `sellBrokerPct` (5; add co-op flip tax if any) · `capGainPct` (30)

### calcRvo output
`breakEven` (first year owning wins if sold then; null = never in horizon), `initialOutlay`,
`mansion`, `recording` (0 for co-ops — exempt), `buyCosts`, and `years[]` with per-year `interest`,
`principal`, `balance`, `carry`, `taxBenefit` = `benefitMaint` (property/§216 deductions) +
`benefitBorrow` (your mortgage interest), `outflow` (after-tax cash cost), `rentAnnual`,
`portfolio` (renter's wealth), `ownerNW` (if sold that year, net of transfer taxes, broker, cap
gains over the §121 exclusion — which requires 2 years), `delta` = ownerNW − portfolio.

## 2. api.html (browser agents)

`GET api.html` with no params → self-describing help JSON in the page body (`<pre id="json">`).
Requires JavaScript execution — plain HTML fetchers get only the loading shell.

```
api.html?mode=cities&gross=150000&status=single&cities=nyc,miami,austin&inPerson=true&commuteDays=4
api.html?mode=rvo&gross=150000&price=950000&type=coop&coopDedPct=60&maintMo=2600&rentMo=4200&rate=5.75
api.html?mode=data
```
Booleans: `true/1/yes`. Unknown city ids and bad enums return `{error, help}`.

## 3. data.json (no JS at all)

The complete verified dataset: federal/state/city brackets, deductions, FICA, SALT cap + phase-down,
NY tax-benefit recapture flag, NYC mansion/recording/transfer taxes, abatement tiers, city presets.
If you compute from it yourself, read the rules in §1 carefully — the SALT cap interplay, NY
recapture, Pub 936 average-balance interest cap, and §121 two-year test are the common mistakes.

## 4. mcp-server.js (MCP clients)

Zero-dependency stdio server; needs `engine.js` at `src/engine.js` relative to itself
(`git clone https://github.com/meticulo3366/mamdani-exit` gives the right layout).

```json
{ "mcpServers": { "mamdani-exit": { "command": "node", "args": ["C:/path/mamdani-exit/mcp-server.js"] } } }
```

Tools: `compare_cities`, `rent_vs_own_nyc`, `get_tax_data` — same params as §1, flattened
(income + rvo params in one object for `rent_vs_own_nyc`).

## Guarantees & limits

- Engine is covered by a 94-assertion test suite (`node test/engine.test.js`), hand-verified against
  IRS/state figures and amortization tables; constants were adversarially re-verified Aug 2026.
- Not modeled: AMT, NIIT on wages (n/a), CT recapture, PMI, refinancing, NY-state itemizing,
  co-op flip taxes (fold into `sellBrokerPct`), renter portfolio taxes.
- Rents/cost-of-living presets are editable placeholders; tax math is exact to the data.
