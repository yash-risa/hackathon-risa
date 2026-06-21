# RISA · Auth Guardian — standalone UI mock

A polished, **frontend-only** mock of the RISA dashboard with a new **Auth Guardian**
section: a proactive prior-authorization *renewal worklist* for oral oncolytics.
No backend, no real API calls — all data is **synthetic and in-memory**, with a
pinned watcher date (`2026-06-21`) so the countdowns are deterministic. No real PHI.

## Run it

**Option A — just open the file**

```
open index.html      # macOS
```

(Double-clicking works too. Google Fonts load from the network; React, Tailwind, and Babel ship from `vendor/` so the app runs offline except for fonts.)

**Option B — static server (recommended)**

```
python3 -m http.server 8080
# then visit http://localhost:8080
```

## What's inside

- **RISA shell** — near-black left sidebar (RISA wordmark, Worklists / Delivery /
  Calling / Status / Config, account + logout), white content area, product-style
  topbar and dense data table.
- **Auth Guardian** (active section) — renewal worklist with summary stat cards,
  trigger pills, day-left countdown, status pills, recommendations, and per-row
  **Approve / Dismiss** plus a bulk **Approve selected** split-button.
  - **Approve** → row moves to *Filed*, shows a toast, and writes to the **Audit Log**.
  - **Dismiss** → requires a reason (logged).
  - **Suppressed** cases (therapy stopped / progressed / transferred) are held for
    review and can't be one-click approved.
  - **Audit Log** tab shows every attributable action.
- **SFTP Orders** (stub) — the original reference view, reachable via the *Delivery*
  nav item, so the shell feels like the real product.

## Files

- `index.html` — the entire app (single file, zero build).
- `vendor/` — React, React DOM, Babel, Tailwind (local copies).
- `PROMPT.md` — reusable vibe-coding prompt to regenerate/extend this UI.
- `README.md` — this file.
