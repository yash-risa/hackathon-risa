/*
 * app.js — Auth Guardian dashboard UI (vanilla JS, no build step)
 * Renders three tabs (Worklist / Audit Log / Backtest) into index.html.
 */
(function () {
  const D = window.AG_DATA;
  const E = window.AG_ENGINE;
  const $ = (sel, root) => (root || document).querySelector(sel);

  const state = {
    tab: "worklist",
    today: D.TODAY,
    lead: D.ASSUMPTIONS.leadTimeDays,
    pendingDismissCase: null,
  };

  // ---- Seed the audit log with the watcher's initial detections ----
  function seedAuditLog() {
    E.clearAuditLog();
    const wl = E.buildWorklist(D.cases, state.today, state.lead);
    wl.forEach((item) => {
      const c = item.case;
      if (c.suppress) {
        E.logEvent("trigger_detected", c.id, "watcher", "Trigger near (" + item.primaryReason + ") but latent status = " + c.suppressLabel);
      } else {
        E.logEvent("trigger_detected", c.id, "watcher", item.primaryReason + " — " + fmtDays(item.daysToTrigger) + " (" + c.drug.brand + ")");
      }
    });
    E.logEvent("highlighted", null, "watcher", "Highlighted " + wl.length + " cases on the worklist as of " + state.today + " (lead time " + state.lead + "d).");
  }

  // ---- helpers ----
  function fmtDays(n) {
    if (n < 0) return Math.abs(n) + "d ago";
    if (n === 0) return "today";
    return "in " + n + "d";
  }
  function statusClass(s) {
    return (
      { "On track": "ontrack", "At risk": "atrisk", Lapsed: "lapsed", "Suppressed-review": "suppressed", Filed: "filed", Dismissed: "dismissed" }[s] || "ontrack"
    );
  }
  function money(n) {
    return "$" + Number(n).toLocaleString("en-US");
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  // ===========================================================================
  // TABS
  // ===========================================================================
  function renderTabs() {
    const wl = E.buildWorklist(D.cases, state.today, state.lead).filter((i) => i.case.workflowState === "monitoring");
    const tabs = [
      { id: "worklist", label: "Worklist", badge: wl.length },
      { id: "audit", label: "Audit Log", badge: E.getAuditLog().length },
      { id: "backtest", label: "Backtest", badge: null },
    ];
    const nav = $("#tabs");
    nav.innerHTML = "";
    tabs.forEach((t) => {
      const b = document.createElement("button");
      b.className = state.tab === t.id ? "active" : "";
      b.innerHTML = esc(t.label) + (t.badge != null ? ' <span class="tab-badge">' + t.badge + "</span>" : "");
      b.onclick = () => {
        state.tab = t.id;
        render();
      };
      nav.appendChild(b);
    });
  }

  // ===========================================================================
  // WORKLIST
  // ===========================================================================
  function renderWorklist() {
    const items = E.buildWorklist(D.cases, state.today, state.lead);
    const active = items.filter((i) => i.case.workflowState === "monitoring");

    const view = $("#view");
    const wrap = document.createElement("div");
    wrap.className = "panel";

    wrap.innerHTML =
      '<div class="phead">' +
      "<div><h2>Renewal Worklist</h2><div class=\"sub\">Cases approaching an auth / insurance trigger within " +
      state.lead +
      " days (plus recently lapsed & suppression reviews)</div></div>" +
      '<div class="spacer"></div>' +
      '<button class="btn primary" id="bulkApprove">Approve all on-track (' + active.filter((i) => !i.suppress).length + ")</button>" +
      "</div>";

    if (!items.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "No cases on the worklist for this date.";
      wrap.appendChild(e);
      view.appendChild(wrap);
      return;
    }

    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr>" +
      "<th>Patient</th><th>Drug</th><th>Payer</th><th>Trigger</th><th>Expires</th><th>Status</th><th>Action</th>" +
      "</tr></thead><tbody></tbody>";
    const tb = $("tbody", table);

    items.forEach((item) => {
      const c = item.case;
      const tr = document.createElement("tr");

      const cd = item.daysToTrigger;
      const cdClass = cd < 0 ? "neg" : cd <= 14 ? "soon" : "ok";
      const reasonExtra = item.reasons.length > 1 ? ' <span class="reason-tag">(+' + (item.reasons.length - 1) + " more)</span>" : "";

      let actionsHtml;
      if (c.workflowState === "filed") {
        actionsHtml = '<span class="pill filed">Filed</span>';
      } else if (c.workflowState === "dismissed") {
        actionsHtml = '<span class="pill dismissed">Dismissed</span>';
      } else if (c.suppress) {
        actionsHtml =
          '<div class="rowact"><button class="btn" disabled title="Blocked by suppression check">Approve</button>' +
          '<button class="btn danger" data-dismiss="' + c.id + '">Dismiss</button></div>';
      } else {
        actionsHtml =
          '<div class="rowact"><button class="btn primary" data-approve="' + c.id + '">Approve</button>' +
          '<button class="btn danger" data-dismiss="' + c.id + '">Dismiss</button></div>';
      }

      tr.innerHTML =
        '<td class="patient"><b>' + esc(c.patient.name) + "</b><small>" + c.patient.age + c.patient.sex + " · " + c.id + "</small></td>" +
        '<td class="drug"><b>' + esc(c.drug.brand) + "</b><small>" + esc(c.drug.generic) + " · " + esc(c.diagnosis.code) + "</small></td>" +
        '<td class="payer">' + esc(c.payer.name.split(" (")[0]) + "<small>" + esc(c.payer.type) + "</small></td>" +
        '<td><span class="reason-tag">' + esc(item.primaryReason || "—") + "</span>" + reasonExtra + "</td>" +
        '<td class="mono countdown ' + cdClass + '">' + fmtDays(cd) + "</td>" +
        '<td><span class="pill ' + statusClass(item.status) + '">' + item.status + "</span>" +
        (c.suppress ? '<div class="reason-tag">' + esc(c.suppressLabel) + "</div>" : "") +
        "</td>" +
        "<td>" + actionsHtml + "</td>";
      tb.appendChild(tr);
    });

    wrap.appendChild(table);
    view.appendChild(wrap);

    // wire actions
    $("#bulkApprove").onclick = () => {
      active.filter((i) => !i.suppress).forEach((i) => E.fileRenewal(i.case, "client (bulk)"));
      render();
    };
    wrap.querySelectorAll("[data-approve]").forEach((b) => {
      b.onclick = () => {
        const c = D.cases.find((x) => x.id === b.getAttribute("data-approve"));
        E.fileRenewal(c, "client");
        render();
      };
    });
    wrap.querySelectorAll("[data-dismiss]").forEach((b) => {
      b.onclick = () => openDismiss(b.getAttribute("data-dismiss"));
    });
  }

  // ---- Dismiss dialog (reason required) ----
  function openDismiss(caseId) {
    const c = D.cases.find((x) => x.id === caseId);
    state.pendingDismissCase = c;
    const dlg = $("#dismissDialog");
    $("#dismissCaseLabel").textContent = c.patient.name + " · " + c.drug.brand + " · " + c.id;
    const reasons = c.suppress
      ? ["Therapy stopped — do not renew", "Patient transferred out", "Disease progressed off-regimen", "Other (clinical review)"]
      : ["Therapy ended / no longer needed", "Patient transferred out", "Duplicate / already renewed", "Client declined renewal", "Other"];
    const opts = $("#dismissOpts");
    opts.innerHTML = reasons
      .map((r, i) => '<label><input type="radio" name="dr" value="' + esc(r) + '"' + (i === 0 ? " checked" : "") + " /> " + esc(r) + "</label>")
      .join("");
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  function wireDialog() {
    const dlg = $("#dismissDialog");
    $("#dismissCancel").onclick = () => dlg.close && dlg.close();
    $("#dismissConfirm").onclick = () => {
      const sel = dlg.querySelector('input[name="dr"]:checked');
      const reason = sel ? sel.value : "Dismissed";
      if (state.pendingDismissCase) E.dismissCase(state.pendingDismissCase, "client", reason);
      state.pendingDismissCase = null;
      if (dlg.close) dlg.close();
      render();
    };
  }

  // ===========================================================================
  // AUDIT LOG
  // ===========================================================================
  function renderAudit() {
    const log = E.getAuditLog();
    const view = $("#view");
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.innerHTML =
      '<div class="phead"><div><h2>Audit Log</h2><div class="sub">Every watcher detection and reviewer action, with timestamp + actor</div></div>' +
      '<div class="spacer"></div><span class="today-pill">' + log.length + " events</span></div>";

    const list = document.createElement("div");
    list.className = "log";
    // newest last (chronological); show most recent first for readability
    log.slice().reverse().forEach((ev) => {
      const row = document.createElement("div");
      row.className = "logitem";
      const t = new Date(ev.ts);
      const ts = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      row.innerHTML =
        '<div class="ts">' + ts + (ev.caseId ? " · " + esc(ev.caseId) : "") + "</div>" +
        '<div class="ev ' + esc(ev.event) + '">' + esc(ev.event.replace(/_/g, " ")) + "</div>" +
        "<div><b style=\"color:var(--muted)\">" + esc(ev.actor) + ":</b> " + esc(ev.detail) + "</div>";
      list.appendChild(row);
    });
    wrap.appendChild(list);
    view.appendChild(wrap);
  }

  // ===========================================================================
  // BACKTEST
  // ===========================================================================
  function renderBacktest() {
    const bt = E.runBacktest(D.cases);
    const monthly = E.monthlyTriggerCounts(D.cases);
    const tl = E.caseTimeline(D.cases.find((c) => c.id === D.featuredId));
    const A = D.ASSUMPTIONS;
    const view = $("#view");

    // ----- headline metric cards -----
    const cards = document.createElement("div");
    cards.className = "panel";
    cards.innerHTML =
      '<div class="phead"><div><h2>Backtest — Reactive vs Auth Guardian</h2>' +
      '<div class="sub">Full synthetic cohort of ' + bt.n + " approved PAs (" + bt.continuing + " continuing, " + bt.shouldSuppress + " should-suppress) replayed under both processes</div></div></div>" +
      '<div class="cards">' +
      metricCard("Lapses (reactive)", bt.reactive.lapses + " <small style=\"font-size:14px;color:var(--muted)\">(" + bt.reactive.lapsePct + "%)</small>", "bad", "Renewal initiated at next visit") +
      metricCard("Lapses (Auth Guardian)", bt.proactive.lapses + " <small style=\"font-size:14px;color:var(--muted)\">(" + bt.proactive.lapsePct + "%)</small>", "good", "Fires " + bt.leadDays + "d before trigger") +
      metricCard("Therapy-gap days eliminated", bt.delta.gapDaysEliminated.toLocaleString(), "good", "Sum of days off-therapy avoided") +
      metricCard("No-auth denials avoided", bt.delta.denialsAvoided, "good", "Claims that would bounce un-authorized") +
      metricCard("Dollars-at-risk protected", money(bt.delta.dollarsProtected), "good", "@ " + money(A.avgClaimValue) + "/claim (assumed)") +
      metricCard("Staff scramble-hours saved", bt.delta.scrambleHoursSaved + " h", "good", "@ " + A.scrambleHoursPerLapse + " h/lapse (assumed)") +
      metricCard("Suppression triage precision", bt.delta.triagePrecision + "%", "good", bt.proactive.suppressedCorrectly + "/" + bt.shouldSuppress + " correctly held for review") +
      metricCard("Client-approval touches", bt.delta.clientApprovalTouches, "", "1 approval per continuing renewal") +
      "</div>";

    // ----- comparison bars -----
    const maxLapse = Math.max(bt.reactive.lapses, 1);
    const compare = document.createElement("div");
    compare.className = "compare";
    compare.innerHTML =
      colHtml("Reactive (today)", "var(--red)", [
        bar("Lapsed authorizations", bt.reactive.lapses, maxLapse, "var(--red)"),
        bar("No-auth denials", bt.reactive.denials, maxLapse, "var(--red)"),
        bar("Therapy-gap days", bt.reactive.gapDays, bt.reactive.gapDays || 1, "var(--amber)", bt.reactive.gapDays),
      ]) +
      colHtml("Auth Guardian (proactive)", "var(--green)", [
        bar("Lapsed authorizations", bt.proactive.lapses, maxLapse, "var(--green)"),
        bar("No-auth denials", bt.proactive.denials, maxLapse, "var(--green)"),
        bar("Suppressed for review", bt.proactive.suppressedCorrectly, maxLapse, "#c9a3ff"),
      ]);
    cards.appendChild(compare);

    const assume = document.createElement("div");
    assume.className = "assumption";
    assume.innerHTML =
      "Assumptions (labeled, synthetic): avg claim value <code>" + money(A.avgClaimValue) + "</code> · scramble effort <code>" +
      A.scrambleHoursPerLapse + " h/lapse</code> · lead time <code>" + A.leadTimeDays + " d</code>. " +
      "Note: <code>insuranceExpiry</code> is NOT captured by Risa today — Auth Guardian proposes pulling it from the EMR at auth time.";
    cards.appendChild(assume);
    view.appendChild(cards);

    // ----- monthly trigger distribution -----
    const mPanel = document.createElement("div");
    mPanel.className = "panel";
    mPanel.style.marginTop = "16px";
    const maxM = Math.max.apply(null, monthly.map((m) => m.count));
    mPanel.innerHTML =
      '<div class="phead"><div><h2>Monthly trigger volume</h2><div class="sub">When the ' + bt.n + " cohort cases hit their auth/insurance trigger</div></div></div>";
    mPanel.appendChild(monthlyChart(monthly, maxM));
    view.appendChild(mPanel);

    // ----- Maria before/after timeline -----
    const mp = document.createElement("div");
    mp.className = "panel";
    mp.style.marginTop = "16px";
    const c = tl.case;
    mp.innerHTML =
      '<div class="phead"><div><h2>Featured case — ' + esc(c.patient.name) + "</h2><div class=\"sub\">" +
      esc(c.patient.age + c.patient.sex) + " · metastatic HR+/HER2- breast cancer · " + esc(c.drug.brand) + " (" + esc(c.drug.generic) + ") · " + esc(c.payer.name) + "</div></div></div>";
    mp.appendChild(mariaTimeline(tl));
    view.appendChild(mp);

    // ----- sample renewal packet -----
    const packet = E.draftRenewalPacket(c);
    const pk = document.createElement("div");
    pk.className = "note";
    pk.textContent = packet;
    const pkHead = document.createElement("div");
    pkHead.style.cssText = "padding:14px 18px 0;color:var(--muted);font-size:12px";
    pkHead.textContent = "Auto-drafted renewal packet (filed only after client approval):";
    mp.appendChild(pkHead);
    mp.appendChild(pk);
  }

  function metricCard(label, value, cls, foot) {
    return (
      '<div class="metric"><div class="label">' + esc(label) + '</div>' +
      '<div class="value ' + (cls || "") + '">' + value + "</div>" +
      '<div class="foot">' + esc(foot) + "</div></div>"
    );
  }
  function colHtml(title, color, rows) {
    return '<div class="col"><h3><span class="dot" style="background:' + color + '"></span>' + esc(title) + "</h3>" + rows.join("") + "</div>";
  }
  function bar(label, val, max, color, rawVal) {
    const pct = Math.round((val / (max || 1)) * 100);
    return (
      '<div class="barrow"><div>' + esc(label) + '</div>' +
      '<div class="bar"><span style="width:' + pct + "%;background:" + color + '"></span></div>' +
      '<div class="mono" style="text-align:right">' + (rawVal != null ? rawVal.toLocaleString() : val) + "</div></div>"
    );
  }

  // inline SVG monthly bar chart (no libs)
  function monthlyChart(monthly, maxM) {
    const W = 1080, H = 200, padL = 30, padB = 34, padT = 12;
    const n = monthly.length;
    const bw = (W - padL) / n;
    const plotH = H - padB - padT;
    let bars = "";
    monthly.forEach((m, i) => {
      const h = Math.round((m.count / maxM) * plotH);
      const x = padL + i * bw + 4;
      const y = padT + (plotH - h);
      const w = bw - 8;
      bars +=
        '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="url(#g)"></rect>' +
        '<text x="' + (x + w / 2) + '" y="' + (y - 4) + '" fill="#93a4c4" font-size="10" text-anchor="middle">' + m.count + "</text>" +
        '<text x="' + (x + w / 2) + '" y="' + (H - 12) + '" fill="#7e90b3" font-size="9" text-anchor="middle" transform="rotate(0)">' + m.month.slice(2) + "</text>";
    });
    const div = document.createElement("div");
    div.style.padding = "12px 18px 18px";
    div.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#4f8cff"/></linearGradient></defs>' +
      bars +
      "</svg>";
    return div;
  }

  // Maria before/after timeline as inline SVG
  function mariaTimeline(tl) {
    const c = tl.case;
    const U = D.util;
    // window: grant -> a bit past reactive initiate
    const start = c.grantDate;
    const end = U.addDays(tl.reactiveInitiateDate, 20);
    const span = E.daysBetween(start, end) || 1;
    const W = 1080, H = 150, padL = 12, padR = 12, top1 = 36, top2 = 96;
    const plotW = W - padL - padR;
    const xOf = (iso) => padL + (E.daysBetween(start, iso) / span) * plotW;

    const fire = tl.proactiveFireDate;
    const expiry = c.authExpiry;
    const visit = tl.reactiveInitiateDate;

    function marker(x, color, label, sub, anchor) {
      anchor = anchor || "middle";
      return (
        '<line x1="' + x + '" y1="20" x2="' + x + '" y2="120" stroke="#233351" stroke-dasharray="3 3"/>' +
        '<circle cx="' + x + '" cy="' + (label.row === 1 ? top1 : top2) + '" r="6" fill="' + color + '"/>' +
        '<text x="' + x + '" y="' + (label.row === 1 ? top1 - 12 : top2 + 22) + '" fill="#e8eefb" font-size="11" font-weight="700" text-anchor="' + anchor + '">' + label.t + "</text>" +
        '<text x="' + x + '" y="' + (label.row === 1 ? top1 - 0 : top2 + 36) + '" fill="#93a4c4" font-size="9.5" text-anchor="' + anchor + '">' + sub + "</text>"
      );
    }

    const xGrant = xOf(start), xFire = xOf(fire), xExp = xOf(expiry), xVisit = xOf(visit);

    const svg =
      '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" preserveAspectRatio="xMidYMid meet">' +
      // proactive track (green up to expiry)
      '<rect x="' + padL + '" y="' + (top1 - 4) + '" width="' + (xExp - padL) + '" height="8" rx="4" fill="#2fd27a" opacity="0.85"/>' +
      // reactive track: green until expiry, red gap until visit
      '<rect x="' + padL + '" y="' + (top2 - 4) + '" width="' + (xExp - padL) + '" height="8" rx="4" fill="#2fd27a" opacity="0.55"/>' +
      '<rect x="' + xExp + '" y="' + (top2 - 4) + '" width="' + (xVisit - xExp) + '" height="8" rx="4" fill="#ff5d6c"/>' +
      marker(xGrant, "#4f8cff", { t: "Auth granted", row: 1 }, c.grantDate, "start") +
      marker(xFire, "#7c5cff", { t: "Guardian files", row: 1 }, fire + " (−" + D.ASSUMPTIONS.leadTimeDays + "d)") +
      marker(xExp, "#ffb547", { t: "Auth expires", row: 2 }, expiry) +
      marker(xVisit, "#ff5d6c", { t: "Reactive: next visit", row: 2 }, visit + " (+" + tl.reactiveGapDays + "d gap)", "end") +
      "</svg>";

    const div = document.createElement("div");
    div.className = "timeline";
    div.innerHTML =
      svg +
      '<div style="display:flex;gap:24px;margin-top:6px;flex-wrap:wrap">' +
      '<div><span class="pill ontrack">Auth Guardian</span> files ' + fire + ", " + D.ASSUMPTIONS.leadTimeDays + " days before expiry → <b>no gap</b>, therapy continues.</div>" +
      '<div><span class="pill lapsed">Reactive</span> waits for her ' + visit + " visit → <b>" + tl.reactiveGapDays + "-day therapy gap</b> and a no-auth denial.</div>" +
      "</div>";
    return div;
  }

  // ===========================================================================
  // RENDER ROOT
  // ===========================================================================
  function render() {
    $("#todayLabel").textContent = state.today;
    renderTabs();
    const view = $("#view");
    view.innerHTML = "";
    if (state.tab === "worklist") renderWorklist();
    else if (state.tab === "audit") renderAudit();
    else if (state.tab === "backtest") renderBacktest();
  }

  // init
  seedAuditLog();
  wireDialog();
  render();
})();
