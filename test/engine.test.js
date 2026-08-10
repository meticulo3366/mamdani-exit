// Headless verification of the calculator's tax engine.
// Extracts the engine section from the HTML and cross-checks against hand-computed values.
// Run: node test/engine.test.js
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "src", "calculator.html"), "utf8");
const start = html.indexOf('"use strict"');
const end = html.indexOf("/* ================= FORMATTING");
const engine = html.slice(start, end);

// stubs
global.localStorage = { getItem: () => null, setItem: () => {} };

let fails = 0;
function approx(label, got, want, tol = 2) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${got.toFixed(2)}, want ${want.toFixed(2)}`);
}

function runTests() {
// ---- progTax sanity: 2026 federal single, taxable 181,355 ----
approx("fed single 181,355", progTax(DATA.federal.brackets.single, 181355), 36123.20);

// ---- NY recapture: single, wages 200k → taxable 192,000 ----
approx("NY state 200k single (recapture)", stateTax(DATA.states.NY, 200000, "single").tax, 11328);
approx("NY state 100k single (no recapture)", stateTax(DATA.states.NY, 100000, "single").tax, 4859.75);

// ---- Full NYC calc: 200k single ----
INPUTS = { gross: 200000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0, nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
const nyc = calcCity("nyc");
approx("NYC SS", nyc.ss, 11439);
approx("NYC medicare", nyc.medicare, 2900);
approx("NYC state", nyc.state, 11328);
approx("NYC city tax", nyc.cityTax, 7317.09);
if (!nyc.usedItemized) { fails++; console.log("FAIL  NYC should itemize"); } else console.log("PASS  NYC itemizes");
approx("NYC fed", nyc.fed, 36123.18, 3);
approx("NYC total tax", nyc.totalTax, 69107.3, 5);
approx("NYC take-home", nyc.takeHome, 130892.7, 5);

// ---- Miami: no state tax, std deduction ----
const mia = calcCity("miami");
approx("Miami state", mia.state, 0);
approx("Miami fed", mia.fed, 36734);
approx("Miami total tax", mia.totalTax, 51073);
if (mia.usedItemized) { fails++; console.log("FAIL  Miami should take std"); } else console.log("PASS  Miami takes std");

// ---- NY-sourced bonus toggle ----
INPUTS.nySrc = true;
approx("Miami yr-1 NY bonus tax", calcCity("miami").nyExtra, 4531.20);
const den = calcCity("denver");
approx("Denver CO state", den.state, 8091.60);
approx("Denver yr-1 NY net extra", den.nyExtra, 1294.56);
INPUTS.nySrc = false;

// ---- MFJ + high income: 600k, SALT phase-down ----
INPUTS = { gross: 600000, bonusPct: 40, status: "mfj", k401: 24500, spend: 3000, carCost: 750, propTax: 0, otherItem: 0, nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
const nycHi = calcCity("nyc");
approx("NYC hi state (recapture)", nycHi.state, 38322.33);
approx("NYC hi city", nycHi.cityTax, 21459.59);
if (nycHi.usedItemized) { fails++; console.log("FAIL  hi-income NYC should take std (SALT phased down)"); } else console.log("PASS  SALT phase-down forces std");
approx("hi medicare w/ addl", nycHi.medicare, 11850);

// ---- CA: SF single 300k, SDI ----
INPUTS = { gross: 300000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0, nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
const sf = calcCity("sf");
approx("SF CA state", sf.state, 23911.63);
approx("SF CA SDI", sf.payroll, 3600);

// ---- Transportation: cars + transit ----
INPUTS = { gross: 200000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0, nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
const nycT = calcCity("nyc");
approx("NYC transport (0 cars + $132 transit)", nycT.transport, 1584);
approx("NYC discretionary w/ transit", nycT.disc, 130892.73 - 50400 - 36000 - 1584, 5);
const miaT = calcCity("miami");
approx("Miami transport (1 car)", miaT.transport, 9000);
if (miaT.cars !== 1) { fails++; console.log("FAIL  Miami cars should be 1"); } else console.log("PASS  Miami cars=1");
approx("legacy fallback cars", cityCars({}), 1);
approx("legacy fallback baseline transit", cityTransit({baseline:true}), 132);

// ---- Regional belt: RI, Beacon, commuter toggle ----
approx("Providence RI state", calcCity("providence").state, 8215.58);
const bea = calcCity("beacon");
approx("Beacon NY state (same as NYC state)", bea.state, 11328);
approx("Beacon city tax = 0", bea.cityTax, 0);
const pri = calcCity("princeton");
approx("Princeton NJ state (no NYC job)", pri.state, 10550.05);
approx("Princeton no commute extra", pri.nyCommute, 0);
INPUTS.nycJob = true;
const priJ = calcCity("princeton");
approx("Princeton NY commute extra", priJ.nyCommute, 11328 - 10550.05);
approx("Princeton state+commute = NY level", priJ.state + priJ.nyCommute, 11328);
INPUTS.nySrc = true;
approx("Princeton commute suppresses bonus sourcing", calcCity("princeton").nyExtra, 0);
approx("Miami still gets yr-1 bonus tax", calcCity("miami").nyExtra, 4531.20);
INPUTS.nySrc = false; INPUTS.nycJob = false;

// ---- Commute time value & PA local EIT ----
INPUTS = { gross: 100000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0,
  nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
approx("commute cost off by default", calcCity("beacon").timeCost, 0);
INPUTS.inPerson = true;
const beaC = calcCity("beacon");
approx("Beacon commute hours", beaC.commuteHrs, 408);
approx("Beacon commute cost", beaC.timeCost, 10200);
approx("NYC commute cost", calcCity("nyc").timeCost, 4200);
INPUTS.inPerson = false;
const beaOff = calcCity("beacon");
INPUTS.inPerson = true;
approx("Beacon disc drops by time cost", beaOff.disc - calcCity("beacon").disc, 10200);
INPUTS.inPerson = false;
approx("Lancaster PA state", calcCity("lancaster").state, 3070);
approx("Lancaster local EIT", calcCity("lancaster").cityTax, 1100);
approx("Pittsburgh EIT", calcCity("pittsburgh").cityTax, 3000);
approx("Newport RI state", calcCity("newport").state, 3428.38);

// ---- Rent vs Own (NYC) ----
const cfg = DEFAULT_DATA.nycOwn;
// mansion tax: full-price cliff, not marginal
approx("mansion below 1M", mansionTax(999999, cfg), 0);
approx("mansion at 1M", mansionTax(1000000, cfg), 10000);
approx("mansion 2.5M @1.25%", mansionTax(2500000, cfg), 31250);
// recording tax: co-op exempt; buyer pays 1.8% (<500k) / 1.925% (>=500k) — already net of lender's 0.25%
approx("recording co-op exempt", recordingTax(640000, "coop", cfg), 0);
approx("recording 400k", recordingTax(400000, "condo", cfg), 7200);
approx("recording 640k", recordingTax(640000, "condo", cfg), 12320);
// seller transfer taxes: NYS is 0.65% TOTAL on residential >= $3M (0.4% base + 0.25% supplement)
approx("RPTT 1.2M", rpttSell(1200000, cfg), 21900);
approx("RPTT 3.5M w/ supplemental", rpttSell(3500000, cfg), 72625);
// amortization: 640k @6% 30yr → payment $3,837.13/mo; balance ≈ $632,138 after yr 1
const am = amortYears(640000, 0.06, 30);
approx("amort yr1 P+I", am[0].interest + am[0].principal, 3837.13 * 12, 3);
approx("amort yr1 balance", am[0].balance, 632138, 30);
// full scenario: 800k condo, 20% down, 6%, ptax 7200, abate 17.5%, income 200k single
INPUTS = { gross: 200000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0,
  nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
RVO = { price: 800000, type: "condo", downPct: 20, rate: 6.0, maintMo: 1200, ptaxAnnual: 7200, abatePct: 17.5,
  rentMo: 3800, rentGrowPct: 3, apprPct: 3, invPct: 7, horizonYrs: 10, sellBrokerPct: 5, capGainPct: 30 };
const rv = calcRvo();
approx("rvo buy costs (recording+other)", rv.buyCosts, 12320 + 12000);
approx("rvo cash to close", rv.initialOutlay, 160000 + 24320);
const y1 = rv.years[0];
// benefit ≈ 24% × (net property tax 5,940 + year-1 interest), all inside the 24% bracket ($640k loan < $750k → full interest)
approx("rvo yr1 tax benefit", y1.taxBenefit, 0.24 * (5940 + y1.interest), 3);
// carry = maint 14,400 + net ptax 5,940
approx("rvo yr1 carry", y1.carry, 20340);
// renter portfolio recurrence: 184,320×1.07 + (outflow − 45,600)
approx("rvo yr1 portfolio", y1.portfolio, 184320 * 1.07 + (y1.outflow - 45600), 1);
// owner net worth if sold end of yr 1: value 824k − balance − (5% broker + RPTT) − 0 cap gains
const sc1 = 824000 * 0.05 + rpttSell(824000, cfg);
approx("rvo yr1 owner NW", y1.ownerNW, 824000 - y1.balance - sc1, 1);
if (y1.delta >= 0) { fails++; console.log("FAIL  year-1 NYC buy should trail renting"); } else console.log("PASS  year-1 owner trails renter (as expected)");
// co-op: no recording tax, abatement as maintenance credit, §216 deduction-letter split
RVO = Object.assign({}, RVO, { type: "coop", maintMo: 2400, ptaxAnnual: 0, coopTaxPct: 45, coopIntPct: 10 });
const rvC = calcRvo();
approx("rvo co-op no recording", rvC.recording, 0);
// ptax share = 28,800×45% = 12,960; carry = 28,800 − 12,960×17.5% = 28,800 − 2,268 = 26,532
approx("rvo co-op yr1 carry w/ abatement credit", rvC.years[0].carry, 26532);
// building interest share = 28,800×10% = 2,880, deducted OUTSIDE the SALT cap
approx("rvo co-op bldg interest share", rvC.years[0].bldgInt, 2880);
// all deduction pieces sit in the 24% bracket at 200k: benefit = 24% × (ptaxNet 10,692 + share-loan interest + bldgInt 2,880)
approx("rvo co-op yr1 tax benefit incl. §216 interest", rvC.years[0].taxBenefit,
  0.24 * (12960 * 0.825 + rvC.years[0].interest + 2880), 3);
// SALT-cap independence: with state+city already at the cap, the interest share still deducts.
// 600k MFJ: SALT cap floors at 19,250 < state+city (59,782) → ptax share adds NOTHING, bldgInt still does.
INPUTS = { gross: 600000, bonusPct: 40, status: "mfj", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0,
  nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
const rvC2 = calcRvo();
// SALT cap at 600k MFJ = 40,400 − 30%×95,000 = 11,900; renter takes the 32,200 std instead.
// Owner itemizes 11,900 + interest + bldgInt; benefit = 35% × (that − 32,200), all in the 35% bracket.
approx("rvo co-op SALT-capped benefit nets out the std deduction", rvC2.years[0].taxBenefit,
  0.35 * (11900 + rvC2.years[0].interest + 2880 - 32200), 3);
INPUTS = { gross: 200000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0,
  nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
// §121 gating: 30%/yr appreciation → big yr-1 gain gets NO exclusion; yr 2 gets it
RVO = Object.assign({}, RVO, { type: "condo", maintMo: 1200, ptaxAnnual: 7200, apprPct: 30 });
const rvG = calcRvo();
// yr1: value 1.04M; sellCosts = 5%×1.04M + (1.425%+0.4%)×1.04M = 52,000 + 18,980 = 70,980
// basis = 800,000 + 12,000 (recording excluded per Pub 551) → gain = 1,040,000−70,980−812,000 = 157,020, excl 0 → tax 30%
approx("§121 yr1 no exclusion", rvG.years[0].capTax, 157020 * 0.30, 2);
// yr2: value 1,352,000; sellCosts = 6.825%×1,352,000 = 92,274; gain = 447,726; excl 250k → tax = 59,317.80
approx("§121 yr2 exclusion applies", rvG.years[1].capTax, (1352000 - 92274 - 812000 - 250000) * 0.30, 3);
// Pub 936 per-year interest ratio: $960k loan → yr1 avg balance ≈ 954,106 → ratio ≈ 0.7861, rising later
RVO = Object.assign({}, RVO, { price: 1200000, downPct: 20, apprPct: 3 });
const rvB = calcRvo();
approx("Pub 936 yr1 ratio (960k loan)", rvB.years[0].intRatio, 750000 / ((960000 + rvB.years[0].balance) / 2), 0.001);
if (!(rvB.years[9].intRatio > rvB.years[0].intRatio)) { fails++; console.log("FAIL  interest ratio should rise as loan amortizes"); }
else console.log("PASS  interest ratio rises as loan amortizes");
// mansion tax at 1.2M flows into buy costs: 12,000
approx("rvo 1.2M mansion in buy costs", rvB.mansion, 12000);

// ---- Mortgage terms & rate overrides ----
// 15-yr amortization: 640k @ 6%/15yr → $5,400.69/mo; paid off by year 15
approx("amort 15-yr payment", amortYears(640000, 0.06, 15)[0].interest + amortYears(640000, 0.06, 15)[0].principal, 5400.69 * 12, 5);
approx("amort 15-yr paid off", amortYears(640000, 0.06, 15)[14].balance, 0, 1);
// 20-yr: 640k @ 6%/20yr → $4,585.06/mo (716.43 per 100k × 6.4)
approx("amort 20-yr payment", amortYears(640000, 0.06, 20)[0].interest + amortYears(640000, 0.06, 20)[0].principal, 4585.15 * 12, 8);
// 10-yr: 640k @ 6%/10yr → $7,105.34/mo (1,110.21 per 100k × 6.4); paid off by year 10
approx("amort 10-yr payment", amortYears(640000, 0.06, 10)[0].interest + amortYears(640000, 0.06, 10)[0].principal, 7105.34 * 12, 8);
approx("amort 10-yr paid off", amortYears(640000, 0.06, 10)[9].balance, 0, 1);
// 10-yr term via calcRvo: loan gone at horizon end → owner equity is full value at yr 10
const rv10 = calcRvo({ termYrs: 10 });
approx("10-yr term: no balance left at yr 10", rv10.years[9].balance, 0, 1);
// calcRvo honors termYrs and rate overrides without mutating saved inputs
RVO = { price: 800000, type: "condo", downPct: 20, rate: 6.0, termYrs: 30, maintMo: 1200, ptaxAnnual: 7200, abatePct: 17.5,
  coopTaxPct: 45, coopIntPct: 10, rentMo: 3800, rentGrowPct: 3, apprPct: 3, invPct: 7, horizonYrs: 10, sellBrokerPct: 5, capGainPct: 30 };
const rv5 = calcRvo({ rate: 5 });
// 640k @ 5%/30yr → $3,435.65/mo
approx("rate override 5% payment", rv5.years[0].interest + rv5.years[0].principal, 3435.65 * 12, 5);
approx("override does not mutate saved rate", calcRvo().years[0].interest + calcRvo().years[0].principal, 3837.13 * 12, 5);
const rv15 = calcRvo({ termYrs: 15 });
approx("term override 15-yr payment", rv15.years[0].interest + rv15.years[0].principal, 5400.69 * 12, 5);
// shorter term: less interest, more principal in year 1
if (!(rv15.years[0].interest < calcRvo().years[0].interest && rv15.years[0].principal > calcRvo().years[0].principal)) {
  fails++; console.log("FAIL  15-yr should shift payment toward principal");
} else console.log("PASS  15-yr shifts payment toward principal");
// lower rate → earlier or equal break-even, never later
const be6 = calcRvo().breakEven || 99, be5 = calcRvo({ rate: 5 }).breakEven || 99;
if (be5 > be6) { fails++; console.log("FAIL  lower rate must not delay break-even"); }
else console.log("PASS  lower rate break-even <= higher rate");
}

// Run assertions inside the engine's eval scope so its strict-mode declarations are visible.
eval(engine + "\n;(" + runTests.toString() + ")();");
console.log(fails === 0 ? "\nALL ENGINE CHECKS PASS" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
