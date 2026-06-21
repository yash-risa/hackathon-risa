# Risa — Auth Guardian (hackathon prototype)

Auth Guardian makes Risa's prior-authorization (PA) workflow **proactive**. Risa's existing engine stops at *"approved."* Auth Guardian adds a layer on top that:

1. **Stores trigger dates** on every approved case (auth expiry + insurance/plan-year/redetermination expiry).
2. **Watches** those dates and highlights cases as they approach (default 45-day lead time), plus a monthly regimen-change re-check.
3. **Suppresses** cases where therapy has stopped (discontinued / transferred / progressed / hospice) so they are never auto-renewed.
4. **Files the renewal only after explicit client approval**, drafting a renewal packet through the existing engine and logging every action.

The result: near-zero authorization lapses, no therapy gaps, and no no-auth claim denials — with a full audit trail.

## How to run

This is a **no-build, dependency-free** app. Two options:

**Option A — just open it**

```
open index.html
```

(Everything is vanilla JS; the `vendor/` folder is bundled so it also works fully offline.)

**Option B — local web server** (recommended for clean asset loading)

```
cd "auth-guardian"
python3 -m http.server 8777
# then open http://localhost:8777
```

## What you'll see

- **Worklist** — highlighted cases with patient, drug, payer, trigger reason, an "expires in N days" countdown, a status pill (On track / At risk / Lapsed / Suppressed-review), and per-row **Approve** / **Dismiss (with reason)** buttons plus a **bulk Approve**. Approving files the renewal and writes to the log.
- **Audit Log** — chronological, attributable record of every watcher detection and reviewer action.
- **Backtest** — Reactive vs Auth Guardian metric cards, comparison bars, a monthly trigger-volume SVG chart, and a before/after timeline for the featured patient (Maria, metastatic breast cancer on palbociclib), plus a sample auto-drafted renewal packet.

## Files

| File | Purpose |
|---|---|
| `index.html` | Dashboard shell + styling |
| `data.js` | 100% synthetic, deterministic cohort of ~150 approved oral-oncolytic PAs (`window.AG_DATA`) |
| `engine.js` | Date-watcher, suppression check, approval-gated file action, audit log, `runBacktest` (`window.AG_ENGINE`) |
| `app.js` | Vanilla-JS UI (Worklist / Audit Log / Backtest) |
| `vendor/` | Local React/Babel copies (bundled for offline parity with the sibling prototype; the UI itself needs no libraries) |
| `RESULTS.md` | Deck-ready backtest metrics + example cases |

## Notes

- **All data is synthetic and deterministic** (seeded `mulberry32`, seed `20260621`). No real PHI. The demo is identical on every run.
- `insuranceExpiry` is **not** captured by Risa today — Auth Guardian proposes pulling it from the EMR/payer portal at auth time. It is the binding trigger for a large share of lapses.
- Dollar/effort figures are **labeled assumptions** ($10,000 avg claim, 2.5 staff-hours per lapse), tunable in `data.js → ASSUMPTIONS`.
