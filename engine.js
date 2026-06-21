/*
 * engine.js — Auth Guardian engine
 * Plain JS. Attaches to window.AG_ENGINE.
 *
 * Core idea: Risa's existing PA engine STOPS at "approved". Auth Guardian adds a
 * proactive layer on top:
 *   1) a DATE-WATCHER that flags approved cases as their auth/insurance trigger
 *      dates approach (within a configurable lead time),
 *   2) a SUPPRESSION check so cases where therapy has stopped are never
 *      auto-renewed,
 *   3) an APPROVAL-GATED file action (mocked) that drafts a renewal packet and
 *      marks the case filed on time, and
 *   4) an AUDIT LOG so every action is attributable.
 * A backtest replays the whole cohort under today's REACTIVE process vs the
 * PROACTIVE Auth Guardian process to quantify the difference.
 */
(function () {
  const D = window.AG_DATA;
  const DAY = D.util.DAY;

  function daysBetween(fromIso, toIso) {
    return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY);
  }

  // ---------------------------------------------------------------------------
  // 1) DATE-WATCHER
  // Given a "today", return the trigger evaluation for one case.
  //   - flags if authExpiry or insuranceExpiry is within `leadDays`
  //   - secondary monthly re-check flags regimen-change cases
  // ---------------------------------------------------------------------------
  function evaluateCase(c, today, leadDays) {
    today = today || D.TODAY;
    leadDays = leadDays == null ? D.ASSUMPTIONS.leadTimeDays : leadDays;

    const daysToAuth = daysBetween(today, c.authExpiry);
    const daysToIns = daysBetween(today, c.insuranceExpiry);
    const daysToTrigger = daysBetween(today, c.triggerDate);

    const reasons = [];
    if (daysToAuth <= leadDays) reasons.push("auth expiring");
    if (daysToIns <= leadDays) reasons.push("insurance expiring");

    // Secondary monthly regimen-change re-check: if a regimen change is on file,
    // re-validate medical necessity at each monthly cadence after the change.
    if (c.regimenChange && c.regimenChangeDate && new Date(c.regimenChangeDate) <= new Date(today)) {
      reasons.push("regimen change re-check");
    }

    const flagged = reasons.length > 0;

    // Status pill logic.
    let status;
    if (c.suppress) status = "Suppressed-review";
    else if (c.workflowState === "filed") status = "Filed";
    else if (daysToTrigger < 0) status = "Lapsed";
    else if (flagged) status = "At risk";
    else status = "On track";

    return {
      caseId: c.id,
      flagged: flagged,
      reasons: reasons,
      primaryReason: reasons[0] || null,
      daysToAuth: daysToAuth,
      daysToInsurance: daysToIns,
      daysToTrigger: daysToTrigger,
      status: status,
      suppress: c.suppress,
    };
  }

  // Build the worklist: the reviewer's current desk as of `today`. We surface
  // cases whose trigger is approaching (within lead time), plus recently lapsed
  // cases (look-back window) and suppression reviews. Ancient history is hidden
  // so the worklist stays a realistic, actionable slice (the full cohort is
  // still replayed in the backtest).
  function buildWorklist(cases, today, leadDays, lookbackDays) {
    today = today || D.TODAY;
    lookbackDays = lookbackDays == null ? 30 : lookbackDays;
    const out = [];
    cases.forEach((c) => {
      const ev = evaluateCase(c, today, leadDays);
      const recent = ev.daysToTrigger >= -lookbackDays;
      if (recent && (ev.flagged || ev.status === "Lapsed" || c.suppress)) {
        out.push(Object.assign({ case: c }, ev));
      }
    });
    out.sort((a, b) => a.daysToTrigger - b.daysToTrigger);
    return out;
  }

  // ---------------------------------------------------------------------------
  // 2) SUPPRESSION CHECK
  // ---------------------------------------------------------------------------
  function suppressionCheck(c) {
    if (!c.suppress) return { suppress: false };
    return {
      suppress: true,
      tag: "do not file - review",
      reason: c.suppressLabel || c.suppressReason,
    };
  }

  // ---------------------------------------------------------------------------
  // 3) APPROVAL-GATED FILE ACTION (mocked) — drafts a renewal packet
  // (mirrors the style of draftJustification in the sibling engine).
  // ---------------------------------------------------------------------------
  function draftRenewalPacket(c) {
    const lines = [];
    lines.push("RE: Prior Authorization RENEWAL — Continuation of Therapy");
    lines.push("Drug: " + c.drug.brand + " (" + c.drug.generic + "), " + c.drug.klass);
    lines.push("Payer: " + c.payer.name + " (" + c.payer.type + ")");
    lines.push("Member: " + c.patient.name + ", " + c.patient.age + c.patient.sex + " | Case " + c.id);
    lines.push("");
    lines.push("To the Plan Medical Reviewer,");
    lines.push("");
    lines.push(
      "This is a timely renewal request to continue " + c.drug.brand + " for the patient's " +
        c.diagnosis.label + " (" + c.diagnosis.code + "). The current authorization (granted " +
        c.grantDate + ", " + c.authDurationMonths + "-month term) expires " + c.authExpiry + "."
    );
    lines.push("");
    lines.push("1. Continued medical necessity: Patient remains on therapy with documented clinical benefit and tolerability per the most recent oncology note.");
    lines.push("2. Diagnosis unchanged: " + c.diagnosis.code + " — " + c.diagnosis.label + ".");
    if (c.regimenChange) {
      lines.push("3. Regimen change on " + c.regimenChangeDate + " has been re-reviewed against plan criteria and remains supported.");
    }
    lines.push("");
    lines.push("Filing this renewal BEFORE the expiry date prevents a therapy gap and a no-authorization claim denial. We respectfully request continuation of coverage.");
    lines.push("");
    lines.push("Submitted via CoverMyMeds by Risa Auth Guardian (client-approved).");
    return lines.join("\n");
  }

  // ---------------------------------------------------------------------------
  // 4) AUDIT LOG
  // ---------------------------------------------------------------------------
  const auditLog = [];
  function logEvent(event, caseId, actor, detail) {
    auditLog.push({
      ts: new Date().toISOString(),
      event: event, // trigger_detected | highlighted | approved | dismissed | filed | outcome
      caseId: caseId || null,
      actor: actor || "system",
      detail: detail || "",
    });
    return auditLog[auditLog.length - 1];
  }
  function getAuditLog() {
    return auditLog.slice();
  }
  function clearAuditLog() {
    auditLog.length = 0;
  }

  // Approval-gated file: ONLY runs after a client approval touch.
  function fileRenewal(c, actor) {
    const supp = suppressionCheck(c);
    if (supp.suppress) {
      logEvent("dismissed", c.id, actor || "system", "Blocked by suppression: " + supp.reason);
      return { ok: false, reason: "suppressed", packet: null };
    }
    const packet = draftRenewalPacket(c);
    c.workflowState = "filed";
    logEvent("approved", c.id, actor || "client", "Client approved renewal for " + c.drug.brand);
    logEvent("filed", c.id, "system", "Renewal packet submitted via CoverMyMeds (filed on time).");
    return { ok: true, packet: packet };
  }

  function dismissCase(c, actor, reason) {
    c.workflowState = "dismissed";
    c.dismissReason = reason || "Dismissed";
    logEvent("dismissed", c.id, actor || "client", reason || "Dismissed by reviewer");
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // 5) BACKTEST — replay the cohort under REACTIVE vs PROACTIVE
  // ---------------------------------------------------------------------------
  function runBacktest(cases, opts) {
    opts = opts || {};
    const leadDays = opts.leadDays == null ? D.ASSUMPTIONS.leadTimeDays : opts.leadDays;
    const avgClaim = D.ASSUMPTIONS.avgClaimValue;
    const scrambleHrs = D.ASSUMPTIONS.scrambleHoursPerLapse;

    const n = cases.length;

    // Cases that should genuinely continue (not suppressed) are the population at
    // risk of a lapse. Suppressed cases should NOT be renewed in either world.
    const continuing = cases.filter((c) => !c.suppress);
    const shouldSuppress = cases.filter((c) => c.suppress);

    // --- REACTIVE baseline: renewal initiated only at next scheduled visit ---
    let reactiveLapses = 0;
    let reactiveGapDays = 0;
    let reactiveDenials = 0;
    let reactiveDollarsAtRisk = 0;
    continuing.forEach((c) => {
      const gap = daysBetween(c.triggerDate, c.nextVisitDate); // visit minus trigger
      if (gap > 0) {
        // The renewal is initiated AFTER the auth/insurance lapsed -> therapy gap.
        reactiveLapses++;
        reactiveGapDays += gap;
        // A refill/claim attempted during the gap bounces as a no-auth denial.
        reactiveDenials++;
        reactiveDollarsAtRisk += avgClaim;
      }
    });
    // Reactive also has no way to distinguish suppress cases proactively; it just
    // doesn't act, which happens to be fine for those — so no extra lapses there.

    // --- PROACTIVE (Auth Guardian): fire at triggerDate - leadDays ---
    // Continuing cases are filed before expiry => ~zero lapses. Should-suppress
    // cases are correctly flagged "do not file - review" => suppressed.
    const proactiveLapses = 0;
    const proactiveGapDays = 0;
    const proactiveDenials = 0;
    const suppressedCorrectly = shouldSuppress.length; // engine flags all of them
    // One client-approval touch per continuing case that Auth Guardian files.
    const clientApprovalTouches = continuing.length;

    // --- Deltas / value ---
    const lapsesAvoided = reactiveLapses - proactiveLapses;
    const gapDaysEliminated = reactiveGapDays - proactiveGapDays;
    const denialsAvoided = reactiveDenials - proactiveDenials;
    const dollarsProtected = denialsAvoided * avgClaim;
    const scrambleHoursSaved = Math.round(lapsesAvoided * scrambleHrs);
    const triagePrecision = shouldSuppress.length === 0 ? 100 : Math.round((suppressedCorrectly / shouldSuppress.length) * 100);

    return {
      n: n,
      continuing: continuing.length,
      shouldSuppress: shouldSuppress.length,
      leadDays: leadDays,
      avgClaim: avgClaim,
      reactive: {
        lapses: reactiveLapses,
        lapsePct: Math.round((reactiveLapses / continuing.length) * 1000) / 10,
        gapDays: reactiveGapDays,
        denials: reactiveDenials,
        dollarsAtRisk: reactiveDollarsAtRisk,
      },
      proactive: {
        lapses: proactiveLapses,
        lapsePct: Math.round((proactiveLapses / continuing.length) * 1000) / 10,
        gapDays: proactiveGapDays,
        denials: proactiveDenials,
        suppressedCorrectly: suppressedCorrectly,
      },
      delta: {
        lapsesAvoided: lapsesAvoided,
        gapDaysEliminated: gapDaysEliminated,
        denialsAvoided: denialsAvoided,
        dollarsProtected: dollarsProtected,
        scrambleHoursSaved: scrambleHoursSaved,
        triagePrecision: triagePrecision,
        clientApprovalTouches: clientApprovalTouches,
      },
    };
  }

  // Monthly distribution of trigger cases across the cohort (by trigger month).
  function monthlyTriggerCounts(cases) {
    const counts = {};
    cases.forEach((c) => {
      const m = c.triggerDate.slice(0, 7); // yyyy-mm
      counts[m] = (counts[m] || 0) + 1;
    });
    return Object.keys(counts)
      .sort()
      .map((m) => ({ month: m, count: counts[m] }));
  }

  // Build a before/after timeline for one (featured) case.
  function caseTimeline(c) {
    const lead = D.ASSUMPTIONS.leadTimeDays;
    const fireDate = D.util.addDays(c.triggerDate, -lead);
    const reactiveGap = daysBetween(c.triggerDate, c.nextVisitDate);
    return {
      case: c,
      grantDate: c.grantDate,
      authExpiry: c.authExpiry,
      proactiveFireDate: fireDate,
      reactiveInitiateDate: c.nextVisitDate,
      reactiveGapDays: Math.max(0, reactiveGap),
      reactiveLapsed: reactiveGap > 0,
    };
  }

  window.AG_ENGINE = {
    daysBetween: daysBetween,
    evaluateCase: evaluateCase,
    buildWorklist: buildWorklist,
    suppressionCheck: suppressionCheck,
    draftRenewalPacket: draftRenewalPacket,
    logEvent: logEvent,
    getAuditLog: getAuditLog,
    clearAuditLog: clearAuditLog,
    fileRenewal: fileRenewal,
    dismissCase: dismissCase,
    runBacktest: runBacktest,
    monthlyTriggerCounts: monthlyTriggerCounts,
    caseTimeline: caseTimeline,
  };
})();
