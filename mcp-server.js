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
const E = require(path.join(__dirname, "src", "engine.js"));

const TOOLS = [
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

function handleTool(name, args) {
  const a = args || {};
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
    const { gross, status, k401, otherItem, ...rvo } = a;
    const inputs = {};
    if (gross !== undefined) inputs.gross = gross;
    if (status !== undefined) inputs.status = status;
    if (k401 !== undefined) inputs.k401 = k401;
    if (otherItem !== undefined) inputs.otherItem = otherItem;
    const r = E.calcRvo(rvo, inputs, E.DEFAULT_DATA);
    return { taxYear: E.DEFAULT_DATA.meta.taxYear, inputs: Object.assign({}, E.DEFAULT_INPUTS, inputs), rvo: Object.assign({}, E.DEFAULT_RVO, rvo),
      summary: {
        breakEvenYear: r.breakEven, cashToClose: r.initialOutlay, mansionTax: r.mansion, recordingTax: r.recording,
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
        respond(msg.id, {
          protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "mamdani-exit", version: E.VERSION },
          instructions: "NYC cost-of-living & taxes calculator (2026, verified against primary sources). compare_cities ranks US cities by what you keep; rent_vs_own_nyc simulates buying vs renting in NYC with NYC-specific law; get_tax_data returns all brackets/rules. Not tax advice."
        });
      } else if (msg.method === "tools/list") {
        respond(msg.id, { tools: TOOLS });
      } else if (msg.method === "tools/call") {
        const { name, arguments: args } = msg.params || {};
        try {
          const result = handleTool(name, args);
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
