/* The Mamdani Exit — shared tax & cost-of-living engine.
 * Used by: calculator page, api.html (JSON endpoint), mcp-server.js, and the test suite.
 * All functions are pure: pass (inputs, data) explicitly; nothing reads globals or the DOM.
 * Data verified against primary sources (IRS, tax.ny.gov, nyc.gov, state DORs) — see README/API.md.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.NYCEXIT = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const VERSION = "2026.10";

  /* ================= DEFAULT TAX DATA (verified July–Aug 2026) ================= */
  const DEFAULT_DATA = {
    meta: { taxYear: 2026, verified: "2026-08-09" },
    federal: {
      stdDed: { single: 16100, mfj: 32200 },
      brackets: {
        single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [null, 0.37]],
        mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [null, 0.37]]
      },
      salt: { cap: 40400, floor: 10000, phaseoutStart: 505000, phaseoutRate: 0.30 }
    },
    fica: { ssRate: 0.062, ssWageBase: 184500, medicareRate: 0.0145, addlMedicareRate: 0.009, addlThreshold: { single: 200000, mfj: 250000 } },
    states: {
      NY: { name: "New York", type: "brackets", stdDed: { single: 8000, mfj: 16050 }, recapture: "ny",
        brackets: {
          single: [[8500, 0.039], [11700, 0.044], [13900, 0.0515], [80650, 0.054], [215400, 0.059], [1077550, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]],
          mfj: [[17150, 0.039], [23600, 0.044], [27900, 0.0515], [161550, 0.054], [323200, 0.059], [2155350, 0.0685], [5000000, 0.0965], [25000000, 0.103], [null, 0.109]]
        } },
      CA: { name: "California", type: "brackets", stdDed: { single: 5706, mfj: 11412 },
        surtax: { threshold: 1000000, rate: 0.01, label: "CA mental-health surtax" },
        payroll: { rate: 0.012, cap: null, label: "CA SDI (uncapped)" },
        brackets: {
          single: [[10756, 0.01], [25499, 0.02], [40245, 0.04], [55866, 0.06], [70612, 0.08], [360659, 0.093], [432787, 0.103], [721314, 0.113], [1000000, 0.123], [null, 0.133]],
          mfj: [[21512, 0.01], [50998, 0.02], [80490, 0.04], [111732, 0.06], [141224, 0.08], [721318, 0.093], [865574, 0.103], [1442628, 0.113], [2000000, 0.123], [null, 0.133]]
        } },
      NJ: { name: "New Jersey", type: "brackets", stdDed: { single: 1000, mfj: 2000 },
        brackets: {
          single: [[20000, 0.014], [35000, 0.0175], [40000, 0.035], [75000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]],
          mfj: [[20000, 0.014], [50000, 0.0175], [70000, 0.0245], [80000, 0.035], [150000, 0.05525], [500000, 0.0637], [1000000, 0.0897], [null, 0.1075]]
        } },
      CT: { name: "Connecticut", type: "brackets", stdDed: { single: 0, mfj: 0 },
        brackets: {
          single: [[10000, 0.02], [50000, 0.045], [100000, 0.055], [200000, 0.06], [250000, 0.065], [500000, 0.069], [null, 0.0699]],
          mfj: [[20000, 0.02], [100000, 0.045], [200000, 0.055], [400000, 0.06], [500000, 0.065], [1000000, 0.069], [null, 0.0699]]
        } },
      MA: { name: "Massachusetts", type: "flat", rate: 0.05, stdDed: { single: 4400, mfj: 8800 },
        surtax: { threshold: 1083150, rate: 0.04, label: "MA millionaire surtax" } },
      IL: { name: "Illinois", type: "flat", rate: 0.0495, stdDed: { single: 2850, mfj: 5700 } },
      PA: { name: "Pennsylvania", type: "flat", rate: 0.0307, stdDed: { single: 0, mfj: 0 } },
      CO: { name: "Colorado", type: "flat", rate: 0.044, stdDed: { single: 16100, mfj: 32200 } },
      GA: { name: "Georgia", type: "flat", rate: 0.0519, stdDed: { single: 12000, mfj: 24000 } },
      NC: { name: "North Carolina", type: "flat", rate: 0.0399, stdDed: { single: 12750, mfj: 25500 } },
      AZ: { name: "Arizona", type: "flat", rate: 0.025, stdDed: { single: 16100, mfj: 32200 } },
      RI: { name: "Rhode Island", type: "brackets", stdDed: { single: 10550, mfj: 21100 },
        brackets: {
          single: [[82050, 0.0375], [186450, 0.0475], [null, 0.0599]],
          mfj: [[82050, 0.0375], [186450, 0.0475], [null, 0.0599]]
        } },
      FL: { name: "Florida", type: "none" }, TX: { name: "Texas", type: "none" }, TN: { name: "Tennessee", type: "none" },
      NV: { name: "Nevada", type: "none" }, WA: { name: "Washington", type: "none" }
    },
    cities: {
      nyc: { name: "New York", state: "NY", rent: 4200, colIndex: 1.00, commuteMin: 35, cars: 0, transit: 132, baseline: true,
        cityTax: { type: "brackets", base: "stateTaxable",
          brackets: { single: [[12000, 0.03078], [25000, 0.03762], [50000, 0.03819], [null, 0.03876]],
                      mfj: [[21600, 0.03078], [45000, 0.03762], [90000, 0.03819], [null, 0.03876]] } } },
      miami: { name: "Miami", state: "FL", rent: 2800, colIndex: 0.88, commuteMin: 30, cars: 1, transit: 0 },
      austin: { name: "Austin", state: "TX", rent: 1700, colIndex: 0.82, commuteMin: 25, cars: 1, transit: 0 },
      dallas: { name: "Dallas", state: "TX", rent: 1600, colIndex: 0.80, commuteMin: 28, cars: 1, transit: 0 },
      nashville: { name: "Nashville", state: "TN", rent: 1650, colIndex: 0.80, commuteMin: 25, cars: 1, transit: 0 },
      vegas: { name: "Las Vegas", state: "NV", rent: 1500, colIndex: 0.78, commuteMin: 25, cars: 1, transit: 0 },
      seattle: { name: "Seattle", state: "WA", rent: 2300, colIndex: 0.92, commuteMin: 30, cars: 1, transit: 100 },
      sf: { name: "San Francisco", state: "CA", rent: 3300, colIndex: 0.98, commuteMin: 30, cars: 0, transit: 85 },
      la: { name: "Los Angeles", state: "CA", rent: 2400, colIndex: 0.90, commuteMin: 35, cars: 1, transit: 0 },
      boston: { name: "Boston", state: "MA", rent: 3100, colIndex: 0.95, commuteMin: 30, cars: 0, transit: 90 },
      jerseycity: { name: "Jersey City", state: "NJ", rent: 3300, colIndex: 0.92, commuteMin: 35, cars: 0, transit: 130 },
      stamford: { name: "Stamford", state: "CT", rent: 2800, colIndex: 0.90, commuteMin: 60, cars: 1, transit: 280, nycBelt: true },
      chicago: { name: "Chicago", state: "IL", rent: 2100, colIndex: 0.85, commuteMin: 30, cars: 0, transit: 75 },
      philly: { name: "Philadelphia", state: "PA", rent: 1800, colIndex: 0.83, commuteMin: 30, cars: 0, transit: 96,
        cityTax: { type: "flat", rate: 0.0374, base: "gross", label: "Philadelphia wage tax" } },
      denver: { name: "Denver", state: "CO", rent: 1800, colIndex: 0.85, commuteMin: 28, cars: 1, transit: 0 },
      atlanta: { name: "Atlanta", state: "GA", rent: 1800, colIndex: 0.82, commuteMin: 32, cars: 1, transit: 0 },
      charlotte: { name: "Charlotte", state: "NC", rent: 1600, colIndex: 0.78, commuteMin: 26, cars: 1, transit: 0 },
      phoenix: { name: "Phoenix", state: "AZ", rent: 1500, colIndex: 0.80, commuteMin: 28, cars: 1, transit: 0 },
      beacon: { name: "Beacon", state: "NY", rent: 2100, colIndex: 0.82, commuteMin: 85, cars: 1, transit: 415, region: "Hudson Valley · ~1:25 Metro-North to NYC" },
      princeton: { name: "Princeton", state: "NJ", rent: 2600, colIndex: 0.90, commuteMin: 75, cars: 1, transit: 460, nycBelt: true, region: "~1:15 NJ Transit to NYC" },
      asburypark: { name: "Asbury Park", state: "NJ", rent: 2200, colIndex: 0.84, commuteMin: 90, cars: 1, transit: 450, nycBelt: true, region: "Jersey Shore · ~1:30 NJ Transit to NYC" },
      newhaven: { name: "New Haven", state: "CT", rent: 1900, colIndex: 0.83, commuteMin: 100, cars: 1, transit: 526, nycBelt: true, region: "~1:40 Metro-North to NYC" },
      lancaster: { name: "Lancaster", state: "PA", rent: 1500, colIndex: 0.75, commuteMin: 70, cars: 1, transit: 0, region: "~1:10 Amtrak to Philadelphia",
        cityTax: { type: "flat", rate: 0.011, base: "stateTaxable", label: "PA local EIT (typical, editable)" } },
      worcester: { name: "Worcester", state: "MA", rent: 1800, colIndex: 0.82, commuteMin: 60, cars: 1, transit: 0, region: "~1:00 to Boston" },
      providence: { name: "Providence", state: "RI", rent: 1900, colIndex: 0.85, commuteMin: 60, cars: 1, transit: 0, region: "~1:00 to Boston (MBTA/Amtrak)" },
      fortcollins: { name: "Fort Collins", state: "CO", rent: 1700, colIndex: 0.83, commuteMin: 75, cars: 1, transit: 0, region: "~1:15 to Denver" },
      cosprings: { name: "Colorado Springs", state: "CO", rent: 1500, colIndex: 0.80, commuteMin: 70, cars: 1, transit: 0, region: "~1:10 to Denver" },
      tacoma: { name: "Tacoma", state: "WA", rent: 1700, colIndex: 0.85, commuteMin: 50, cars: 1, transit: 0, region: "~0:50 to Seattle" },
      sacramento: { name: "Sacramento", state: "CA", rent: 1800, colIndex: 0.85, commuteMin: 90, cars: 1, transit: 0, region: "~1:30 to San Francisco" },
      riverside: { name: "Riverside", state: "CA", rent: 1900, colIndex: 0.85, commuteMin: 75, cars: 1, transit: 0, region: "Inland Empire · ~1:15 to LA" },
      newbraunfels: { name: "New Braunfels", state: "TX", rent: 1400, colIndex: 0.75, commuteMin: 50, cars: 1, transit: 0, region: "~0:50 to Austin · ~0:35 to San Antonio" },
      murfreesboro: { name: "Murfreesboro", state: "TN", rent: 1400, colIndex: 0.74, commuteMin: 45, cars: 1, transit: 0, region: "~0:45 to Nashville" },
      athens: { name: "Athens", state: "GA", rent: 1400, colIndex: 0.74, commuteMin: 85, cars: 1, transit: 0, region: "~1:25 to Atlanta" },
      westpalm: { name: "West Palm Beach", state: "FL", rent: 2300, colIndex: 0.85, commuteMin: 75, cars: 1, transit: 0, region: "~1:15 to Miami · Brightline ~1:20" },
      hickory: { name: "Hickory", state: "NC", rent: 1200, colIndex: 0.70, commuteMin: 60, cars: 1, transit: 0, region: "~1:00 to Charlotte" },
      pittsburgh: { name: "Pittsburgh", state: "PA", rent: 1400, colIndex: 0.78, commuteMin: 26, cars: 1, transit: 0,
        cityTax: { type: "flat", rate: 0.03, base: "stateTaxable", label: "Pittsburgh resident EIT (city + school)" } },
      allentown: { name: "Allentown", state: "PA", rent: 1500, colIndex: 0.76, commuteMin: 100, cars: 1, transit: 480, nycBelt: true,
        region: "Lehigh Valley · ~1:40 bus to NYC",
        cityTax: { type: "flat", rate: 0.011, base: "stateTaxable", label: "PA local EIT (typical, editable)" } },
      newport: { name: "Newport", state: "RI", rent: 2100, colIndex: 0.88, commuteMin: 40, cars: 1, transit: 0,
        region: "~0:40 to Providence · ~1:30 to Boston" }
    },
    nycOwn: { /* NYC ownership rules — adversarially verified vs primary sources 2026-08 */
      mansion: [[1000000, 0.01], [2000000, 0.0125], [3000000, 0.015], [5000000, 0.0225], [10000000, 0.0325], [15000000, 0.035], [20000000, 0.0375], [25000000, 0.039]],
      recording: { threshold: 500000, below: 0.018, above: 0.01925, coopExempt: true,
        note: "buyer's share (statutory totals 2.05%/2.175% include 0.25% the lender pays)" },
      rpttSell: { threshold: 500000, low: 0.01, high: 0.01425, nys: 0.004, nysSupp: 0.0025, nysSuppMin: 3000000,
        note: "nysSupp raises total NYS to 0.65% on residential $3M+" },
      abatementTiers: [[50000, 28.1], [55000, 25.2], [60000, 22.5], [null, 17.5]],
      closeOtherPct: { condo: 0.015, coop: 0.008, house: 0.015 },
      maintGrowth: 0.03
    }
  };
  const DEFAULT_ACTIVE = ["nyc", "miami", "austin", "nashville", "vegas", "seattle", "la", "boston", "chicago", "philly", "denver", "atlanta", "providence", "lancaster", "pittsburgh", "beacon", "princeton", "newhaven"];
  const DEFAULT_INPUTS = { gross: 100000, bonusPct: 40, status: "single", k401: 0, spend: 3000, carCost: 750, propTax: 0, otherItem: 0, nySrc: false, nycJob: false, inPerson: false, commuteDays: 3, timeValue: 25 };
  const DEFAULT_RVO = { price: 800000, type: "condo", downPct: 20, rate: 6.0, termYrs: 30, maintMo: 1200, ptaxAnnual: 7200, abatePct: 17.5,
    coopDedPct: 60, coopIntPct: 10,
    rentMo: 3800, rentGrowPct: 3, apprPct: 3, invPct: 7, horizonYrs: 10, sellBrokerPct: 5, capGainPct: 30 };

  /* ================= INCOME TAX ENGINE ================= */
  const cityCars = c => (c.cars ?? (c.baseline ? 0 : 1));
  const cityTransit = c => (c.transit ?? (c.baseline ? 132 : 0));

  function progTax(brackets, t) {
    let tax = 0, lo = 0;
    for (const [cap, r] of brackets) {
      const hi = (cap == null) ? Infinity : cap;
      if (t > lo) tax += (Math.min(t, hi) - lo) * r;
      lo = hi;
      if (t <= hi) break;
    }
    return Math.max(0, tax);
  }
  function marginalInfo(brackets, t) { // rate + lower bound of bracket containing t
    let lo = 0;
    for (const [cap, r] of brackets) {
      const hi = (cap == null) ? Infinity : cap;
      if (t <= hi) return { rate: r, lo };
      lo = hi;
    }
    const last = brackets[brackets.length - 1];
    return { rate: last[1], lo };
  }
  function stateTax(st, wages, status) {
    if (!st || st.type === "none") return { tax: 0, taxable: 0 };
    const ded = st.stdDed ? (st.stdDed[status] || 0) : 0;
    const taxable = Math.max(0, wages - ded);
    let tax = 0;
    if (st.type === "flat") { tax = st.rate * taxable; }
    else {
      const br = st.brackets[status];
      tax = progTax(br, taxable);
      if (st.recapture === "ny") { // NY tax-benefit recapture: top rate phases in on ALL taxable income
        const m = marginalInfo(br, taxable);
        const flat = m.rate * taxable;
        const phase = Math.min(1, Math.max(0, (wages - Math.max(107650, m.lo)) / 50000));
        tax = tax + Math.max(0, flat - tax) * phase;
      }
    }
    if (st.surtax) tax += st.surtax.rate * Math.max(0, taxable - st.surtax.threshold);
    return { tax, taxable };
  }
  function calcCity(cityId, inputs, data) {
    const d = data || DEFAULT_DATA;
    const inp = Object.assign({}, DEFAULT_INPUTS, inputs || {});
    const { gross, bonusPct, status, k401, spend, propTax, otherItem, nySrc } = inp;
    const city = d.cities[cityId];
    if (!city) throw new Error("unknown city id: " + cityId + " (valid: " + Object.keys(d.cities).join(", ") + ")");
    const st = d.states[city.state] || { type: "none" };
    const wages = Math.max(0, gross - k401);
    // FICA — identical everywhere (401k does not reduce FICA)
    const ss = d.fica.ssRate * Math.min(gross, d.fica.ssWageBase);
    const medicare = d.fica.medicareRate * gross
      + d.fica.addlMedicareRate * Math.max(0, gross - d.fica.addlThreshold[status]);
    // State
    const sres = stateTax(st, wages, status);
    const payroll = st.payroll ? st.payroll.rate * (st.payroll.cap ? Math.min(wages, st.payroll.cap) : wages) : 0;
    // City tax
    let cityTaxAmt = 0;
    if (city.cityTax) {
      const ct = city.cityTax;
      if (ct.type === "flat") cityTaxAmt = ct.rate * (ct.base === "gross" ? gross : sres.taxable);
      else cityTaxAmt = progTax(ct.brackets[status], sres.taxable);
    }
    // Commuter belt + NYC job: all wages NY-sourced (convenience-of-employer rule), net of home-state credit
    let nyCommute = 0;
    const commutes = inp.nycJob && city.nycBelt && city.state !== "NY";
    if (commutes) {
      nyCommute = Math.max(0, stateTax(d.states.NY, wages, status).tax - sres.tax);
    }
    // First-year NY-sourced bonus (non-NY residents): NY nonresident tax on bonus share, net of resident-state credit.
    // Skipped when the NYC-job toggle already sources ALL wages to NY for this city.
    let nyExtra = 0;
    if (nySrc && city.state !== "NY" && !commutes) {
      const share = Math.min(1, Math.max(0, bonusPct / 100));
      const nyOnBonus = stateTax(d.states.NY, wages, status).tax * share;
      const credit = Math.min(nyOnBonus, sres.tax * share);
      nyExtra = Math.max(0, nyOnBonus - credit);
    }
    // Federal — auto standard vs itemized with SALT cap + phase-down
    const agi = wages;
    const sc = d.federal.salt;
    const cap = Math.min(sc.cap, Math.max(sc.floor, sc.cap - sc.phaseoutRate * Math.max(0, agi - sc.phaseoutStart)));
    const saltPaid = sres.tax + cityTaxAmt + nyExtra + nyCommute + (propTax || 0);
    const itemized = Math.min(saltPaid, cap) + (otherItem || 0);
    const std = d.federal.stdDed[status];
    const usedItemized = itemized > std;
    const fedTaxable = Math.max(0, agi - Math.max(std, itemized));
    const fed = progTax(d.federal.brackets[status], fedTaxable);

    const totalTax = fed + ss + medicare + sres.tax + payroll + cityTaxAmt + nyExtra + nyCommute;
    const takeHome = gross - k401 - totalTax;
    const housing = (city.rent || 0) * 12;
    const otherCOL = (spend || 0) * 12 * (city.colIndex || 1);
    const cars = cityCars(city), transitMo = cityTransit(city);
    const transport = cars * (inp.carCost || 0) * 12 + transitMo * 12;
    // Time value of commuting (imputed, only when working in person)
    const commuteMin = city.commuteMin ?? 30;
    let commuteHrs = 0, timeCost = 0;
    if (inp.inPerson) {
      commuteHrs = 2 * (commuteMin / 60) * (inp.commuteDays || 0) * 48;
      timeCost = commuteHrs * (inp.timeValue || 0);
    }
    const disc = takeHome - housing - otherCOL - transport - timeCost;
    return { id: cityId, name: city.name, stateCode: city.state, stateName: (st.name || city.state),
      fed, ss, medicare, state: sres.tax, payroll, cityTax: cityTaxAmt, nyExtra, nyCommute,
      payrollLabel: st.payroll ? st.payroll.label : null, region: city.region || null,
      totalTax, takeHome, housing, otherCOL, transport, cars, transitMo, commuteMin, commuteHrs, timeCost, disc, usedItemized,
      fedDed: Math.max(std, itemized), effRate: gross > 0 ? totalTax / gross : 0,
      stateLocal: sres.tax + payroll + cityTaxAmt + nyExtra + nyCommute, baseline: !!city.baseline };
  }
  function compareCities(inputs, data, cityIds) {
    const d = data || DEFAULT_DATA;
    const unknown = (cityIds || []).filter(id => !d.cities[id]);
    if (unknown.length) throw new Error("unknown city id(s): " + unknown.join(", ") + " (valid: " + Object.keys(d.cities).join(", ") + ")");
    const ids = (cityIds && cityIds.length ? cityIds : DEFAULT_ACTIVE).filter(id => d.cities[id]);
    const out = ids.map(id => calcCity(id, inputs, d));
    out.sort((a, b) => b.disc - a.disc);
    const base = out.find(r => r.id === "nyc") || out.find(r => r.baseline);
    for (const r of out) r.deltaVsBaseline = base && r.id !== base.id ? r.disc - base.disc : 0;
    return { baseline: base ? base.id : null, results: out };
  }

  /* ================= RENT VS OWN (NYC) ENGINE ================= */
  function mansionTax(P, cfg) { // applies to FULL price once over each threshold (not marginal)
    let rate = 0;
    for (const [min, r] of cfg.mansion) if (P >= min) rate = r;
    return P * rate;
  }
  function recordingTax(loan, type, cfg) { // co-ops exempt: share loans aren't real-property mortgages
    if (type === "coop" || loan <= 0) return 0;
    const rc = cfg.recording; // rates are the buyer's share; the lender's 0.25% is on top and not the buyer's cost
    return loan * (loan < rc.threshold ? rc.below : rc.above);
  }
  function rpttSell(value, cfg) { // seller-side transfer taxes, charged at exit
    const t = cfg.rpttSell;
    let tax = value * (value <= t.threshold ? t.low : t.high) + value * t.nys;
    if (value >= t.nysSuppMin) tax += value * t.nysSupp;
    return tax;
  }
  function amortYears(loan, annualRate, years) {
    const mr = annualRate / 12, n = years * 12;
    const pay = mr > 0 ? loan * mr / (1 - Math.pow(1 + mr, -n)) : loan / n;
    const out = []; let bal = loan;
    for (let y = 0; y < years; y++) {
      let I = 0, Pr = 0;
      for (let m = 0; m < 12; m++) { const i = bal * mr; const p = Math.min(pay - i, bal); I += i; Pr += p; bal -= p; }
      out.push({ interest: I, principal: Pr, balance: bal });
    }
    return out;
  }
  function calcRvo(rvo, inputs, data) {
    const d = data || DEFAULT_DATA;
    const cfg = d.nycOwn || DEFAULT_DATA.nycOwn;
    const inp = Object.assign({}, DEFAULT_INPUTS, inputs || {});
    const status = inp.status;
    const v = Object.assign({}, DEFAULT_RVO, rvo || {});
    const P = Math.max(0, v.price);
    const loan0 = P * (1 - Math.min(100, Math.max(0, v.downPct)) / 100);
    const down = P - loan0;
    // one-time buy costs
    const mansion = mansionTax(P, cfg);
    const recording = recordingTax(loan0, v.type, cfg);
    const otherClose = P * (cfg.closeOtherPct[v.type] ?? 0.015);
    const buyCosts = mansion + recording + otherClose;
    const initialOutlay = down + buyCosts;
    // NYC income-tax context at the user's income (drives SALT + itemizing, via the real bracket engine)
    const wages = Math.max(0, inp.gross - inp.k401);
    const sres = stateTax(d.states.NY, wages, status);
    const cityT = progTax(d.cities.nyc.cityTax.brackets[status], sres.taxable);
    const sc = d.federal.salt;
    const saltCap = Math.min(sc.cap, Math.max(sc.floor, sc.cap - sc.phaseoutRate * Math.max(0, wages - sc.phaseoutStart)));
    const std = d.federal.stdDed[status];
    const fedAt = ded => progTax(d.federal.brackets[status], Math.max(0, wages - ded));
    const renterDed = Math.max(std, Math.min(sres.tax + cityT, saltCap) + (inp.otherItem || 0));
    const renterFed = fedAt(renterDed);
    // recurring
    const abate = Math.min(1, Math.max(0, (v.abatePct || 0) / 100));
    const termYrs = Math.max(1, Math.round(+v.termYrs || 30));
    const amort = amortYears(loan0, v.rate / 100, termYrs);
    const growth = 1 + v.apprPct / 100, rentG = 1 + v.rentGrowPct / 100,
          maintG = 1 + (cfg.maintGrowth ?? 0.03), invG = 1 + v.invPct / 100;
    // co-op deductibility per the building's annual tax deduction letter (IRC §216):
    // buildings quote ONE combined % ("60% tax deductible"); of that, the underlying-mortgage-interest
    // slice deducts in full while the remainder is property tax under the SALT cap
    const coopDed = Math.min(0.95, Math.max(0, (v.coopDedPct ?? ((v.coopTaxPct ?? 45) + (v.coopIntPct ?? 10))) / 100));
    const coopIntShare = Math.min(coopDed, Math.max(0, (v.coopIntPct ?? 10) / 100));
    const coopTaxShare = coopDed - coopIntShare;
    let rentAnnual = v.rentMo * 12, maintAnnual = v.maintMo * 12;
    let ptaxAnnual = v.type === "coop" ? maintAnnual * coopTaxShare : (v.ptaxAnnual || 0);
    let portfolio = initialOutlay;
    const years = []; let breakEven = null;
    const excl = status === "mfj" ? 500000 : 250000;
    const basisCosts = mansion + otherClose; // recording tax is a loan cost, not basis (Pub 551)
    for (let n = 1; n <= Math.max(1, Math.round(v.horizonYrs)); n++) {
      const a = amort[n - 1] || { interest: 0, principal: 0, balance: 0 };
      const value = P * Math.pow(growth, n);
      const ptaxNet = ptaxAnnual * (1 - abate);
      // co-op: property tax lives inside maintenance; the abatement arrives as a credit against maintenance
      const carry = v.type === "coop" ? maintAnnual - ptaxAnnual * abate : maintAnnual + ptaxNet;
      const outflowPreTax = a.interest + a.principal + carry;
      // Pub 936: deductible share = $750k / this year's AVERAGE balance (rises toward 1 as the loan amortizes)
      const balStart = n === 1 ? loan0 : (amort[n - 2] ? amort[n - 2].balance : loan0);
      const intRatio = Math.min(1, 750000 / Math.max(1, (balStart + a.balance) / 2));
      // §216 pass-through: co-op's building-mortgage-interest share of maintenance deducts as interest (not SALT-capped)
      const bldgInt = v.type === "coop" ? maintAnnual * coopIntShare : 0;
      const ownDed = Math.max(std, Math.min(sres.tax + cityT + ptaxNet, saltCap) + a.interest * intRatio + bldgInt + (inp.otherItem || 0));
      const taxBenefit = Math.max(0, renterFed - fedAt(ownDed));
      // attribute the benefit to its two sources: the property deductions (maintenance/§216 for co-ops,
      // property tax for condos) vs YOUR borrowing (share-loan/mortgage interest). Sums exactly to taxBenefit.
      const dedNoLoan = Math.max(std, Math.min(sres.tax + cityT + ptaxNet, saltCap) + bldgInt + (inp.otherItem || 0));
      const benefitMaint = Math.max(0, renterFed - fedAt(dedNoLoan));
      const benefitBorrow = taxBenefit - benefitMaint;
      const outflow = outflowPreTax - taxBenefit;
      portfolio = portfolio * invG + (outflow - rentAnnual);
      const sellCosts = value * (v.sellBrokerPct || 0) / 100 + rpttSell(value, cfg);
      const gain = Math.max(0, value - sellCosts - (P + basisCosts));
      const exclAvail = n >= 2 ? excl : 0; // §121 needs 2 years of ownership + use
      const capTax = Math.max(0, gain - exclAvail) * (v.capGainPct || 0) / 100;
      const ownerNW = value - a.balance - sellCosts - capTax;
      const delta = ownerNW - portfolio;
      if (breakEven === null && delta >= 0) breakEven = n;
      years.push({ n, value, interest: a.interest, principal: a.principal, balance: a.balance, carry,
        ptaxNet, bldgInt, taxBenefit, benefitMaint, benefitBorrow, outflowPreTax, outflow, rentAnnual, portfolio, ownerNW, sellCosts, capTax, delta, intRatio });
      rentAnnual *= rentG; maintAnnual *= maintG;
      ptaxAnnual = v.type === "coop" ? maintAnnual * coopTaxShare : ptaxAnnual * maintG;
    }
    return { P, loan0, down, mansion, recording, otherClose, buyCosts, initialOutlay,
      renterFed, saltCap, std, years, breakEven, abate, termYrs, rate: v.rate, horizonYrs: v.horizonYrs };
  }

  return { VERSION, DEFAULT_DATA, DEFAULT_ACTIVE, DEFAULT_INPUTS, DEFAULT_RVO,
    cityCars, cityTransit, progTax, marginalInfo, stateTax, calcCity, compareCities,
    mansionTax, recordingTax, rpttSell, amortYears, calcRvo };
});
