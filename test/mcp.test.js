// MCP server protocol test: spawn the stdio server, run an initialize → tools/list → tools/call
// exchange, and assert on the JSON-RPC responses. Run: node test/mcp.test.js
const { spawn } = require("child_process");
const path = require("path");

const srv = spawn(process.execPath, [path.join(__dirname, "..", "mcp-server.js")], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
let buf = "", nextId = 1, fails = 0;

srv.stdout.setEncoding("utf8");
srv.stdout.on("data", chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); p(msg); }
  }
});
function rpc(method, params) {
  return new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}
function check(label, ok, extra) {
  if (!ok) fails++;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + (extra ? ": " + extra : ""));
}

(async () => {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  check("initialize returns serverInfo", init.result && init.result.serverInfo && init.result.serverInfo.name === "mamdani-exit");
  check("initialize declares tools capability", init.result && init.result.capabilities && !!init.result.capabilities.tools);
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const list = await rpc("tools/list", {});
  const names = (list.result.tools || []).map(t => t.name).sort();
  check("tools/list returns 4 tools", names.join(",") === "compare_cities,evaluate_listing,get_tax_data,rent_vs_own_nyc", names.join(","));
  check("tools have inputSchema", (list.result.tools || []).every(t => t.inputSchema && t.inputSchema.type === "object"));

  const lst = await rpc("tools/call", { name: "evaluate_listing", arguments: { price: 950000, type: "co-op", maintMo: 2600, coopDedPct: 60, gross: 150000, status: "married" } });
  const lstJson = JSON.parse(lst.result.content[0].text);
  check("evaluate_listing accepts listing-speak (co-op, married)", lstJson.listing.type === "coop" && lstJson.oneTimeCosts.mortgageRecordingTax === 0);
  check("evaluate_listing returns tax-savings split", lstJson.monthlyYear1.taxSavings.fromMortgageInterest > 0);
  check("evaluate_listing without rent: ownership-only", lstJson.rentComparison === null);
  check("evaluate_listing amounts rounded to cents", String(lstJson.monthlyYear1.afterTaxCost).replace(/.*\./, "").length <= 2);

  const cmp = await rpc("tools/call", { name: "compare_cities", arguments: { gross: 200000, status: "single", cities: ["nyc", "miami"] } });
  const cmpJson = JSON.parse(cmp.result.content[0].text);
  check("compare_cities returns 2 results", cmpJson.results.length === 2);
  const nyc = cmpJson.results.find(r => r.id === "nyc");
  check("compare_cities NYC total tax matches engine golden value", Math.abs(nyc.totalTax - 69107.27) < 5, nyc.totalTax.toFixed(2));

  const rvo = await rpc("tools/call", { name: "rent_vs_own_nyc", arguments: { gross: 200000, status: "single", price: 800000, type: "coop", coopDedPct: 60, coopIntPct: 10, maintMo: 2400 } });
  const rvoJson = JSON.parse(rvo.result.content[0].text);
  check("rent_vs_own co-op: recording tax exempt", rvoJson.summary.recordingTax === 0);
  check("rent_vs_own co-op: tax savings split present",
    rvoJson.summary.year1.taxSavingsFromMaintenanceDeduction > 0 && rvoJson.summary.year1.taxSavingsFromBorrowing > 0);
  check("rent_vs_own: 10 simulated years", rvoJson.years.length === 10);

  const data = await rpc("tools/call", { name: "get_tax_data", arguments: {} });
  const dataJson = JSON.parse(data.result.content[0].text);
  check("get_tax_data returns brackets", !!dataJson.data.federal.brackets.single);
  check("get_tax_data lists 38 cities", Object.keys(dataJson.data.cities).length === 38, Object.keys(dataJson.data.cities).length);

  const bad = await rpc("tools/call", { name: "compare_cities", arguments: { cities: ["atlantis"] } });
  check("unknown city id returns isError", bad.result.isError === true && /unknown city/.test(bad.result.content[0].text));

  const ping = await rpc("ping", {});
  check("ping answered", !!ping && !ping.error);

  srv.stdin.end();
  console.log(fails === 0 ? "\nALL MCP CHECKS PASS" : "\n" + fails + " MCP CHECK(S) FAILED");
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e); srv.kill(); process.exit(1); });
