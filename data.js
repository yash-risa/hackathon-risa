/*
 * data.js — Synthetic approved oral-oncolytic PA cohort for "Auth Guardian"
 * Plain JS (no JSX) so it loads directly via file:// . Attaches to window.AG_DATA.
 *
 * ============================================================================
 * NOTE: ALL patient data in this file is 100% SYNTHETIC and generated
 * DETERMINISTICALLY with a seeded RNG (mulberry32). No real PHI is used and no
 * data is pulled from any real EMR, payer, or claims system. Names, dates,
 * diagnoses and payers are fabricated. Numbers are tuned only to make the demo
 * realistic and identical on every run.
 * ============================================================================
 */
(function () {
  // ---- Deterministic RNG (mulberry32) so the demo is identical every run ----
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Date helpers (everything stored as ISO yyyy-mm-dd strings) ----
  const DAY = 24 * 60 * 60 * 1000;
  function iso(d) {
    return d.toISOString().slice(0, 10);
  }
  function addDays(isoStr, n) {
    return iso(new Date(new Date(isoStr).getTime() + n * DAY));
  }
  function addMonths(isoStr, m) {
    const d = new Date(isoStr);
    d.setMonth(d.getMonth() + m);
    return iso(d);
  }

  // The fixed "today" for this deterministic demo. The watcher/worklist is
  // evaluated relative to this date so screenshots are identical every run.
  const TODAY = "2026-06-21";

  // ===========================================================================
  // ORAL-ONCOLYTIC DRUG CATALOG (high-PA, high-cost specialty oncology drugs)
  // ===========================================================================
  const DRUGS = [
    { generic: "palbociclib", brand: "Ibrance", klass: "CDK4/6 inhibitor", dx: { code: "C50.911", label: "Malignant neoplasm, unspecified site of right female breast (HR+/HER2- metastatic)" }, avgClaim: 14200 },
    { generic: "abemaciclib", brand: "Verzenio", klass: "CDK4/6 inhibitor", dx: { code: "C50.912", label: "Malignant neoplasm, unspecified site of left female breast (HR+/HER2-)" }, avgClaim: 13800 },
    { generic: "ribociclib", brand: "Kisqali", klass: "CDK4/6 inhibitor", dx: { code: "C50.919", label: "Malignant neoplasm of breast (HR+/HER2- advanced)" }, avgClaim: 13100 },
    { generic: "olaparib", brand: "Lynparza", klass: "PARP inhibitor", dx: { code: "C56.1", label: "Malignant neoplasm of right ovary (BRCA-mutated)" }, avgClaim: 15600 },
    { generic: "lenalidomide", brand: "Revlimid", klass: "Immunomodulator", dx: { code: "C90.00", label: "Multiple myeloma, not in remission" }, avgClaim: 18400 },
    { generic: "enzalutamide", brand: "Xtandi", klass: "Androgen receptor inhibitor", dx: { code: "C61", label: "Malignant neoplasm of prostate (metastatic CRPC)" }, avgClaim: 13900 },
    { generic: "ibrutinib", brand: "Imbruvica", klass: "BTK inhibitor", dx: { code: "C91.10", label: "Chronic lymphocytic leukemia, not in remission" }, avgClaim: 15200 },
    { generic: "osimertinib", brand: "Tagrisso", klass: "EGFR TKI", dx: { code: "C34.90", label: "Malignant neoplasm of lung (EGFR+ NSCLC)" }, avgClaim: 17300 },
    { generic: "everolimus", brand: "Afinitor", klass: "mTOR inhibitor", dx: { code: "C50.911", label: "Malignant neoplasm of breast (HR+ advanced)" }, avgClaim: 12100 },
    { generic: "acalabrutinib", brand: "Calquence", klass: "BTK inhibitor", dx: { code: "C83.10", label: "Mantle cell lymphoma" }, avgClaim: 14700 },
  ];

  const PAYERS = [
    { name: "UnitedHealthcare Medicare Advantage", type: "Medicare Advantage" },
    { name: "Humana Gold Plus (MA)", type: "Medicare Advantage" },
    { name: "Aetna Medicare Advantage", type: "Medicare Advantage" },
    { name: "Wellcare by Allwell (MA)", type: "Medicare Advantage" },
    { name: "Cigna Commercial PPO", type: "Commercial" },
    { name: "Anthem BCBS Commercial", type: "Commercial" },
    { name: "Aetna Commercial", type: "Commercial" },
    { name: "UnitedHealthcare Commercial", type: "Commercial" },
  ];

  const FIRST_F = ["Maria", "Linda", "Patricia", "Susan", "Karen", "Nancy", "Donna", "Carol", "Sandra", "Ruth", "Sharon", "Deborah"];
  const FIRST_M = ["James", "Robert", "John", "Michael", "David", "William", "Richard", "Joseph", "Thomas", "Charles", "Gary", "Frank"];
  const LAST = ["Alvarez", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Gomez", "Hayes", "Iverson", "Jensen", "Kim", "Lopez", "Murphy", "Nguyen", "Owens", "Patel", "Quinn", "Reed", "Silva", "Torres", "Vance", "Walsh"];

  // Labels for the latent "should be suppressed" truth (~10% of cohort).
  const SUPPRESS_REASONS = [
    { key: "therapy_stopped", label: "Therapy discontinued (toxicity)" },
    { key: "transferred", label: "Patient transferred to another practice" },
    { key: "progressed", label: "Disease progressed — off this regimen" },
    { key: "deceased", label: "Patient deceased (hospice)" },
  ];

  // ===========================================================================
  // ASSUMPTIONS (labeled so they can be cited on the slide). All synthetic.
  // ===========================================================================
  const ASSUMPTIONS = {
    leadTimeDays: 45, // watcher fires when a trigger date is within this window
    avgClaimValue: 10000, // assumed avg monthly oral-oncolytic claim value ($)
    scrambleHoursPerLapse: 2.5, // assumed staff hours to recover one lapsed auth
    redeterminationNote:
      "insuranceExpiry (plan-year end / Medicaid redetermination) is NOT stored by Risa today. " +
      "Auth Guardian proposes capturing it at auth time from the EMR/payer portal.",
  };

  // ===========================================================================
  // CASE GENERATION
  // Each case is an ALREADY-APPROVED PA. We then layer on the trigger dates and
  // a reactive-vs-proactive timeline so the backtest can replay both worlds.
  // ===========================================================================
  function generateCases(n) {
    const rng = mulberry32(20260621);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const cases = [];

    for (let i = 0; i < n; i++) {
      const drug = pick(DRUGS);
      const payer = pick(PAYERS);
      const sex = rng() < 0.62 ? "F" : "M"; // breast/ovarian skew in this cohort
      const first = sex === "F" ? pick(FIRST_F) : pick(FIRST_M);
      const name = first + " " + pick(LAST);
      const age = 48 + Math.floor(rng() * 38);

      // Authorization duration + when it was granted.
      const durRoll = rng();
      const authDurationMonths = durRoll < 0.45 ? 6 : durRoll < 0.78 ? 12 : 3;

      // Spread authExpiry from ~120 days in the past to ~300 days in the future
      // relative to TODAY so the worklist (within lead time) is a realistic slice.
      const expiryOffset = Math.floor(-120 + rng() * 420);
      const authExpiry = addDays(TODAY, expiryOffset);
      const grantDate = addMonths(authExpiry, -authDurationMonths);

      // insuranceExpiry: plan-year end for commercial (Dec 31), or a Medicaid /
      // MA redetermination date for government plans. Sometimes this is the
      // binding (earlier) trigger -> reason "insurance expiring".
      let insuranceExpiry;
      if (payer.type === "Commercial") {
        // plan year ends Dec 31; pick the Dec 31 just after grant
        const gy = new Date(grantDate).getFullYear();
        insuranceExpiry = gy + "-12-31";
        if (new Date(insuranceExpiry) < new Date(grantDate)) insuranceExpiry = gy + 1 + "-12-31";
      } else {
        // government plan: redetermination roughly every 12 months from grant,
        // jittered so a meaningful share land before authExpiry.
        insuranceExpiry = addDays(grantDate, 300 + Math.floor(rng() * 130));
      }

      // The binding trigger is whichever comes first.
      const insuranceFirst = new Date(insuranceExpiry) < new Date(authExpiry);
      const triggerDate = insuranceFirst ? insuranceExpiry : authExpiry;
      const triggerReason = insuranceFirst ? "insurance expiring" : "auth expiring";

      // Reactive world: the office only initiates the renewal at the patient's
      // NEXT SCHEDULED VISIT / refill touchpoint. If that falls after the trigger
      // date, therapy lapses. ~32% of cases have the visit land after expiry.
      const visitLate = rng() < 0.32;
      const visitOffset = visitLate
        ? 8 + Math.floor(rng() * 70) // 8-78 days AFTER trigger -> lapse
        : -(5 + Math.floor(rng() * 40)); // 5-45 days BEFORE trigger -> caught in time
      const nextVisitDate = addDays(triggerDate, visitOffset);

      // Regimen change on a subset (~15%): dose/agent change that should force a
      // fresh medical-necessity re-check before the next fill.
      const regimenChange = rng() < 0.15;
      const regimenChangeDate = regimenChange ? addDays(grantDate, 30 + Math.floor(rng() * 120)) : null;

      // Latent "should be suppressed" truth (~10%): therapy is no longer active,
      // so a renewal must NOT be auto-filed.
      const suppressRoll = rng();
      const suppress = suppressRoll < 0.1;
      const suppressInfo = suppress ? pick(SUPPRESS_REASONS) : null;

      cases.push({
        id: "PA-" + String(20000 + i),
        patient: { name: name, age: age, sex: sex },
        drug: { generic: drug.generic, brand: drug.brand, klass: drug.klass },
        diagnosis: drug.dx,
        payer: payer,
        avgClaim: drug.avgClaim,
        grantDate: grantDate,
        authDurationMonths: authDurationMonths,
        authExpiry: authExpiry,
        insuranceExpiry: insuranceExpiry,
        nextVisitDate: nextVisitDate,
        triggerDate: triggerDate,
        triggerReason: triggerReason,
        regimenChange: regimenChange,
        regimenChangeDate: regimenChangeDate,
        // Latent truth — in production this comes from the EMR, not the PA form.
        suppress: suppress,
        suppressReason: suppressInfo ? suppressInfo.key : null,
        suppressLabel: suppressInfo ? suppressInfo.label : null,
        // Mutable demo state (set by the UI / engine as the user acts).
        workflowState: "monitoring", // monitoring | filed | dismissed
        dismissReason: null,
      });
    }
    return cases;
  }

  // ---- The featured before/after patient: Maria, mBC on palbociclib ----
  // We pin a deterministic case so the BACKTEST timeline is always identical.
  function buildMaria() {
    const grantDate = "2025-09-15";
    const authDurationMonths = 6;
    const authExpiry = addMonths(grantDate, authDurationMonths); // 2026-03-15
    return {
      id: "PA-20007",
      featured: true,
      patient: { name: "Maria Alvarez", age: 58, sex: "F" },
      drug: { generic: "palbociclib", brand: "Ibrance", klass: "CDK4/6 inhibitor" },
      diagnosis: { code: "C50.911", label: "Metastatic HR+/HER2- breast cancer" },
      payer: { name: "Humana Gold Plus (MA)", type: "Medicare Advantage" },
      avgClaim: 14200,
      grantDate: grantDate,
      authDurationMonths: authDurationMonths,
      authExpiry: authExpiry, // 2026-03-15
      insuranceExpiry: "2026-08-31",
      nextVisitDate: "2026-04-20", // her next onc visit — 36 days AFTER auth expired
      triggerDate: authExpiry,
      triggerReason: "auth expiring",
      regimenChange: false,
      regimenChangeDate: null,
      suppress: false,
      suppressReason: null,
      suppressLabel: null,
      workflowState: "monitoring",
      dismissReason: null,
    };
  }

  const cases = generateCases(150);
  // Replace one case with the pinned featured patient (keep cohort at 150).
  const maria = buildMaria();
  cases[7] = maria;

  window.AG_DATA = {
    TODAY: TODAY,
    DRUGS: DRUGS,
    PAYERS: PAYERS,
    SUPPRESS_REASONS: SUPPRESS_REASONS,
    ASSUMPTIONS: ASSUMPTIONS,
    cases: cases,
    featuredId: maria.id,
    // expose helpers for the engine/UI
    util: { addDays: addDays, addMonths: addMonths, iso: iso, DAY: DAY },
  };
})();
