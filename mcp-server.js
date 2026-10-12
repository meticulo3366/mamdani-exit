#!/usr/bin/env node
/* The Mamdani Exit — MCP server (stdio). Zero dependencies.
 *
 * Exposes the calculator's verified 2026 tax engine to any MCP client
 * (Claude Desktop/Code, ChatGPT desktop, Cursor, ...).
 *
 * Install: download this file + src/engine.js keeping the layout
 *   (or `git clone https://github.com/meticulo3366/mamdani-exit`), then register:
 *   { "mcpServers": { "mamdani-exit": { "command": "node", "args": ["<path>/mcp-server.js"] } } }
 *
 * Protocol: MCP over stdio, newline-delimited JSON-RPC 2.0.
 */
"use strict";
const path = require("path");
const fs = require("fs");
// engine.js may sit in src/ (repo layout) or beside this file (loose download)
const E = require(["src/engine.js", "engine.js"].map(p => path.join(__dirname, p)).find(p => fs.existsSync(p))
  || path.join(__dirname, "src", "engine.js"));
const round2 = x => (typeof x === "number" && isFinite(x)) ? Math.round(x * 100) / 100 : x;
const deepRound = x => Array.isArray(x) ? x.map(deepRound)
  : (x && typeof x === "object") ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, deepRound(v)]))
  : round2(x);

const TOOLS = [
  {
    name: "evaluate_listing",
    description: "Send a NYC real-estate listing's facts, get the true cost of owning: one-time NYC costs (mansion tax, mortgage recording tax — co-ops exempt), year-1 monthly cost before and after tax savings (split into property-deduction vs mortgage-interest sources), true cost net of principal, and computed tax notes. Include rentMo to also get the rent-vs-own verdict (breakEvenYear null = owning never catches renting within the horizon). Listing-speak accepted: type 'co-op' etc., status 'married'. Amounts USD.",
    inputSchema: {
      type: "object",
      properties: {
        price: { type: "number", description: "asking price" },
        type: { type: "string", description: "condo | coop | house (aliases: co-op, cooperative, condominium, townhouse)" },
        maintMo: { type: "number", description: "monthly maintenance (co-op, taxes included) or common charges (condo)" },
        coopDedPct: { type: "number", description: "co-op: '% tax deductible' as the listing/building letter quotes it (default 60)" },
        coopIntPct: { type: "number", description: "co-op: slice of maintenance that is building mortgage interest (default 10; ask managing agent)" },
        ptaxAnnual: { type: "number", description: "condo/house: annual property tax from the listing (~0.9% of value typical)" },
        abatePct: { type: "number", description: "co-op/condo abatement % (default 17.5; 0 if building doesn't participate)" },
        downPct: { type: "number", description: "down payment % (default 20)" },
        rate: { type: "number", description: "mortgage rate % (default 6.0)" },
        termYrs: { type: "number", description: "10|15|20|30 (default 30)" },
        rentMo: { type: "number", description: "OPTIONAL equivalent rent — include to get the rent-vs-own verdict" },
        gross: { type: "number", description: "buyer's gross income for personalized tax savings (default 100000)" },
        status: { type: "string", description: "single | mfj (aliases: married, joint)" },
        k401: { type: "number" }, otherItem: { type: "number" },
        rentGrowPct: { type: "number" }, apprPct: { type: "number" }, invPct: { type: "number" },
        horizonYrs: { type: "number" }, sellBrokerPct: { type: "number", description: "default 5; add co-op flip tax here" }, capGainPct: { type: "number" }
      },
      required: ["price"]
    }
  },
  {
    name: "compare_cities",
    description: "Rank US cities by discretionary income (take-home pay minus housing, transport, and living costs) for someone considering leaving NYC. Uses real 2026 federal/state/city tax brackets, FICA, SALT cap, NY recapture, commuter rules. Amounts are USD per year.",
    inputSchema: {
      type: "object",
      properties: {
        gross: { type: "number", description: "gross annual income (default 100000)" },
        status: { type: "string", enum: ["single", "mfj"], description: "filing status (default single)" },
        k401: { type: "number", description: "pre-tax 401k contribution per year" },
        spend: { type: "number", description: "non-housing monthly spend at NYC prices (default 3000)" },
        carCost: { type: "number", description: "all-in monthly cost per car (default 750)" },
        bonusPct: { type: "number", description: "bonus share of income, % (default 40)" },
        nySrc: { type: "boolean", description: "first year: bonus still NY-sourced" },
        nycJob: { type: "boolean", description: "keeping a NYC-based job (NY convenience-of-employer rule for NJ/CT belt towns)" },
        inPerson: { type: "boolean", description: "price commute time as an imputed cost" },
        commuteDays: { type: "number", description: "office days per week (default 3)" },
        timeValue: { type: "number", description: "$ per hour your time is worth (default 25; DOT convention ~50% of wage)" },
        cities: { type: "array", items: { type: "string" }, description: "city ids to compare (default: the standard 18). Call get_tax_data for valid ids." }
      }
    }
  },
  {
    name: "rent_vs_own_nyc",
    description: "Simulate buying in NYC (condo, co-op, or 1-3 family house) vs renting, year by year: mansion tax, mortgage recording tax (co-ops exempt), co-op/condo abatement, §216 co-op deduction letter split, SALT-capped federal itemizing via real brackets, Pub 936 interest cap, §121 exclusion, NYC/NYS transfer taxes at exit, renter opportunity cost. Returns break-even year and wealth deltas. Amounts USD.",
    inputSchema: {
      type: "object",
      properties: {
        gross: { type: "number", description: "gross annual income (default 100000)" },
        status: { type: "string", enum: ["single", "mfj"] },
        price: { type: "number", description: "purchase price (default 800000)" },
        type: { type: "string", enum: ["condo", "coop", "house"], description: "unit type (default condo)" },
        downPct: { type: "number", description: "down payment % (default 20)" },
        rate: { type: "number", description: "mortgage rate % (default 6.0)" },
        termYrs: { type: "number", enum: [10, 15, 20, 30], description: "mortgage term (default 30)" },
        maintMo: { type: "number", description: "monthly maintenance (co-op, taxes included) or common charges (condo)" },
        ptaxAnnual: { type: "number", description: "annual property tax (condo/house only; NYC condos ~0.9% of value)" },
        abatePct: { type: "number", description: "co-op/condo abatement % (17.5-28.1 by assessed value; default 17.5)" },
        coopDedPct: { type: "number", description: "co-op: combined % of maintenance that is tax deductible, as the building letter quotes (default 60)" },
        coopIntPct: { type: "number", description: "co-op: slice of maintenance that is building mortgage interest, deducts outside the SALT cap (default 10)" },
        rentMo: { type: "number", description: "equivalent market rent per month (default 3800)" },
        rentGrowPct: { type: "number", description: "rent growth %/yr (default 3; rent-stabilized 2026-27 renewals are frozen at 0)" },
        apprPct: { type: "number", description: "home appreciation %/yr (default 3)" },
        invPct: { type: "number", description: "renter's investment return %/yr (default 7)" },
        horizonYrs: { type: "number", description: "years to simulate (default 10)" },
        sellBrokerPct: { type: "number", description: "broker fee % at sale (default 5; add co-op flip tax here if any)" },
        capGainPct: { type: "number", description: "combined cap-gains rate on gain above the §121 exclusion (default 30)" }
      }
    }
  },
  {
    name: "get_tax_data",
    description: "Return the calculator's full verified 2026 tax dataset: federal/state/city brackets, deductions, FICA, SALT rules, NYC ownership rules (mansion/recording/transfer taxes, abatement tiers), and all city presets with ids.",
    inputSchema: { type: "object", properties: {} }
  }
];

const INCOME_KEYS = ["gross", "status", "k401", "otherItem"];
function splitIncome(a) {
  const inputs = {}, rest = {};
  for (const [k, v] of Object.entries(a)) (INCOME_KEYS.includes(k) ? inputs : rest)[k] = v;
  return { inputs, rest };
}
function handleTool(name, args) {
  const a = args || {};
  if (name === "evaluate_listing") {
    const { inputs, rest } = splitIncome(a);
    return E.evaluateListing(rest, inputs, E.DEFAULT_DATA);
  }
  if (name === "get_tax_data") {
    return { version: E.VERSION, taxYear: E.DEFAULT_DATA.meta.taxYear, defaults: { inputs: E.DEFAULT_INPUTS, rvo: E.DEFAULT_RVO, activeCities: E.DEFAULT_ACTIVE }, data: E.DEFAULT_DATA };
  }
  if (name === "compare_cities") {
    const { cities, ...inputs } = a;
    const out = E.compareCities(inputs, E.DEFAULT_DATA, cities);
    return { taxYear: E.DEFAULT_DATA.meta.taxYear, inputs: Object.assign({}, E.DEFAULT_INPUTS, inputs),
      note: "disc = discretionary income USD/yr after taxes, housing, transport, living costs; deltaVsBaseline = vs staying in NYC",
      baseline: out.baseline, results: out.results };
  }
  if (name === "rent_vs_own_nyc") {
    const { inputs, rest: rvo } = splitIncome(a);
    const r = E.calcRvo(rvo, inputs, E.DEFAULT_DATA);
    const rvoEcho = Object.assign({}, E.DEFAULT_RVO, rvo);
    if (String(rvoEcho.type).toLowerCase().includes("co")) { rvoEcho.ptaxAnnual = null; rvoEcho.ptaxAnnualNote = "unused for co-ops — property tax derives from maintenance × the deduction-letter split"; }
    return { taxYear: E.DEFAULT_DATA.meta.taxYear, inputs: Object.assign({}, E.DEFAULT_INPUTS, inputs), rvo: rvoEcho,
      summary: {
        breakEvenYear: r.breakEven, breakEvenNote: r.breakEven ? undefined : "null = owning never catches renting within horizonYrs at these assumptions",
        cashToClose: r.initialOutlay, mansionTax: r.mansion, recordingTax: r.recording,
        year1: { afterTaxMonthlyCost: r.years[0].outflow / 12, trueMonthlyCostNetOfPrincipal: (r.years[0].outflow - r.years[0].principal) / 12,
          rentMonthly: r.years[0].rentAnnual / 12, taxSavingsFromMaintenanceDeduction: r.years[0].benefitMaint, taxSavingsFromBorrowing: r.years[0].benefitBorrow },
        atHorizon: { year: r.horizonYrs, ownMinusRentWealth: r.years[r.years.length - 1].delta }
      },
      years: r.years };
  }
  throw new Error("unknown tool: " + name);
}

function respond(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"); }
function respondErr(id, code, message) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"); }

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { continue; }
    try {
      if (msg.method === "initialize") {
        const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
        const asked = msg.params && msg.params.protocolVersion;
        respond(msg.id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: {} },
          serverInfo: { name: "mamdani-exit", version: E.VERSION },
          instructions: "NYC cost-of-living & taxes calculator (2026, verified against primary sources). compare_cities ranks US cities by what you keep; rent_vs_own_nyc simulates buying vs renting in NYC with NYC-specific law; get_tax_data returns all brackets/rules. Not tax advice."
        });
      } else if (msg.method === "tools/list") {
        respond(msg.id, { tools: TOOLS });
      } else if (msg.method === "tools/call") {
        const { name, arguments: args } = msg.params || {};
        try {
          const result = deepRound(handleTool(name, args));
          respond(msg.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (e) {
          respond(msg.id, { content: [{ type: "text", text: "Error: " + (e && e.message || e) }], isError: true });
        }
      } else if (msg.method === "ping") {
        respond(msg.id, {});
      } else if (msg.id !== undefined) {
        respondErr(msg.id, -32601, "method not found: " + msg.method);
      } // notifications (no id) are ignored
    } catch (e) {
      if (msg && msg.id !== undefined) respondErr(msg.id, -32603, String(e && e.message || e));
    }
  }
});
process.stdin.on("end", () => process.exit(0));
