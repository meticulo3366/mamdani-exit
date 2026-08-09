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
}

// Run assertions inside the engine's eval scope so its strict-mode declarations are visible.
eval(engine + "\n;(" + runTests.toString() + ")();");
console.log(fails === 0 ? "\nALL ENGINE CHECKS PASS" : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
