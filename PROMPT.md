# Reusable Build Prompt — RISA "Auth Guardian" Dashboard (frontend-only)

Paste this into any capable AI coding tool to regenerate, restyle, or extend the
Auth Guardian UI. It is self-contained: it describes the RISA design system, the
Auth Guardian feature spec, the data model, and the interaction behaviors.

---

## Role & goal

You are an experienced frontend engineer. Build a **polished, standalone,
frontend-only** single-page mock of the **RISA** clinical-ops dashboard with a new
**"Auth Guardian"** section (a proactive prior-authorization renewal worklist).

**Hard constraints**
- Frontend only. **No backend, no real API calls.** All data is mocked in-memory.
- **Zero-build / runs trivially:** prefer a single `index.html` that loads via
  `file://` or any static server. React 18 + Tailwind + Babel-standalone over CDN,
  OR clean vanilla HTML/CSS/JS. Prioritize that it *just runs*.
- 100% synthetic data — **no real PHI**. Use a fixed watcher date so countdowns are
  deterministic (`TODAY = 2026-06-21`).
- Three priorities, in order: (1) it runs, (2) it visually matches the RISA design
  language, (3) the Auth Guardian section is convincing and interactive.

---

## RISA design system (match precisely)

**Shell**
- **Left vertical sidebar**, narrow (~74px), **near-black** (`#0b0e14`). Top-left
  "RISA" wordmark. Stacked nav items = small line-icon above a tiny label
  (`Worklists, Delivery, Calling, Status, Config`). Account + Logout pinned to the
  bottom. Active item has a subtle `bg-white/10`, white icon/text; inactive items
  are `gray-400`.
- **White content area.** Page title top-left, ~20px semibold.
- **Topbar controls** (right-aligned group): search input
  (`Search by Patient Name, Member ID…`, rounded, grey border, leading magnifier),
  a **"Filters"** pill with a **count badge**, a dropdown, a **dark primary
  split-button**, and a small **refresh icon button**.

**Table**
- Dense, white card with rounded corners and a thin border. Header row is small
  (~11px), grey, on a faint grey background. Body rows separated by light
  (`gray-100`) borders, subtle hover. Leading checkbox/copy-icon column.
- **Patient Name** cell shows the name in `gray-900` medium with a smaller grey
  `MRN : …` subline beneath.
- **Footer:** numbered pagination (`Previous 1 2 3 4 Next`) on the left, and
  `Showing 1–10 of N items` on the right.

**Color semantics**
- **Status as colored TEXT** (e.g. SFTP "Response Status"): green = `Approved` /
  `Auth Not Required`; red = `Denied` / `Drug Not Covered`; amber = `Pending`;
  muted grey = `--`.
- **Small badges** for delivery columns: `Success` = green soft pill,
  `Not Started` = grey soft pill, `Not Sent` = dark filled pill.
- Use Inter (or system-ui). Rounded controls, ring-inset pills, restrained shadows.
  Clean modern SaaS feel.

(Optionally stub a static **"SFTP Orders"** view — Batch, DOW, Patient Name+MRN,
DOB, Drug, CoverMyMed#, 2nd STP Status, Response Status, Add[Edit], POC, CMM, Text
Note, Letter Upload, SFTP, ⋯ — so the shell feels like the real product. The Auth
Guardian section is the focus.)

---

## Auth Guardian section (the focus)

A **proactive renewal worklist**: RISA's PA engine stops at "approved"; Auth
Guardian watches approved oral-oncolytic authorizations and flags renewals **before
they lapse**, while never auto-filing cases where therapy has stopped.

Add a new sidebar nav item **"Auth Guardian"** (shield/clock icon), shown **active**.

**Page header:** title `Auth Guardian — Renewal Worklist`, a small "Proactive" tag,
and a subline noting the watcher date.

**Summary stat cards** (row above the table, computed from data):
- `On worklist` — active continuity cases
- `Expiring ≤ 14 days` — urgent count
- `Suppressed (review)` — do-not-auto-file count
- `Claim value protected` — Σ avg monthly claim for continuing (non-lapsed) cases

**Topbar:** search; Filters pill; **"Trigger type"** dropdown
(`All triggers / Auth expiring / Insurance expiring / Regimen change`); a dark
**"Approve selected"** split-button (mirrors "Send to SFTP"); refresh.

**Table columns**
1. leading checkbox
2. **Patient Name** (+ grey `MRN : …` subline)
3. **Drug** (brand + smaller generic; oral oncolytics)
4. **Payer**
5. **Trigger** — colored pill: `Auth expiring` (amber), `Insurance expiring`
   (indigo), `Regimen change` (purple)
6. **Trigger date**
7. **Days left** — countdown text: **red ≤ 14**, **amber 15–30**, **green > 30**,
   **`LAPSED` red** if negative
8. **Status** pill — `On track` (green) / `At risk` (amber) / `Lapsed` (red) /
   `Suppressed - review` (slate) / `Filed` (blue after approval)
9. **Recommendation** — short text (`File renewal`, `File renewal (urgent)`,
   `Re-verify medical necessity`, `Hold — <suppress reason>`)
10. **Actions** — **Approve** (dark primary) + **Dismiss** (ghost) + a `⋯` menu
    (view packet, view timeline, snooze, dismiss)

**Interactions**
- **Approve** a row → moves it to a **`Filed`** state (row dims, status pill turns
  blue) + a success **toast** + writes `approved` and `filed` entries to the
  **Audit Log**.
- **Dismiss** → opens a **modal that requires a reason** (quick-pick chips + free
  text); writes a `dismissed` entry to the audit log.
- **Suppressed** rows cannot be one-click approved (Approve disabled) — they must be
  reviewed. A bulk approve skips them and warns.
- **Bulk "Approve selected"** approves all checked rows; split-menu offers
  "Approve & file all on-track" and "Approve only ≤ 14 days".
- Search filters by name/MRN/drug/payer; Trigger-type dropdown filters; pagination
  10/page.
- **Audit Log tab/toggle** — reverse-chronological list of every action
  (event badge, patient + case id, detail, time, actor) to demonstrate the
  approval-gated, fully-logged design.

---

## Data model (synthetic, in-memory, deterministic)

Watcher `TODAY = '2026-06-21'`. Each row:

```
{
  id, mrn, name, age, sex,
  generic, brand,             // oral oncolytic (palbociclib/Ibrance, etc.)
  payer,                      // UHC / Humana / Aetna / Wellcare / Cigna / Anthem
  trigger,                    // 'Auth expiring' | 'Insurance expiring' | 'Regimen change'
  triggerDate,                // ISO yyyy-mm-dd; days-left = triggerDate - TODAY
  suppress, suppressLabel,    // latent "do not file" truth (therapy stopped, etc.)
  regimenChange,
  workflowState,              // 'monitoring' | 'filed' | 'dismissed'
  dismissReason
}
```

Derive `daysLeft = round((triggerDate - TODAY)/day)`; derive status from
`suppress`, `workflowState`, and `daysLeft` (≤0 Lapsed, ≤30 At risk, else On track).

**Drugs (avg monthly claim $):** palbociclib/Ibrance 14200, abemaciclib/Verzenio
13800, ribociclib/Kisqali 13100, olaparib/Lynparza 15600, lenalidomide/Revlimid
18400, enzalutamide/Xtandi 13900, ibrutinib/Imbruvica 15200, osimertinib/Tagrisso
17300, everolimus/Afinitor 12100, acalabrutinib/Calquence 14700.

**Payers:** UnitedHealthcare (MA + Commercial), Humana Gold Plus (MA), Aetna
(MA + Commercial), Wellcare by Allwell (MA), Cigna Commercial PPO, Anthem BCBS
Commercial.

**Must feature these cases (from the prototype results):**
- **Maria Alvarez** — palbociclib/Ibrance, Humana Gold Plus (MA), *auth expiring*.
- **Joseph Hayes** — acalabrutinib/Calquence, Wellcare by Allwell (MA), *auth
  expiring*.
- **Richard Patel** — abemaciclib/Verzenio, Cigna Commercial PPO, *insurance
  expiring*, **SUPPRESSED — disease progressed** (must be held for review).

Add ~20 more synthetic rows spanning all buckets (lapsed, ≤14, 15–30, >30, plus a
couple more suppressed) so the table and pagination feel real. ~10 per page.

---

## Deliverables

1. `index.html` — the full app (shell + SFTP stub + Auth Guardian + audit log +
   toasts + dismiss modal), runnable by opening the file.
2. `README.md` — one-paragraph "how to run".
3. (this) `PROMPT.md` — the reusable spec.

## Acceptance checks
- Opens with no console errors; CDN scripts load.
- Sidebar + topbar + table visually echo the RISA screenshot; correct color
  semantics.
- Auth Guardian: stat cards compute from data; approve files + logs + toasts;
  dismiss requires a reason; suppressed rows are protected; filters + pagination
  + audit log work.
