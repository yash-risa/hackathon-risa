# Auth Guardian — Backtest Results

> Deck-ready numbers from the Auth Guardian prototype. **All data is 100% synthetic and deterministic** (seeded RNG, `mulberry32` seed `20260621`). Re-running the app produces these exact figures every time. Watcher reference date ("today") = **2026-06-21**.

## Cohort

- **150** already-approved oral-oncolytic prior-authorization cases
- **140** continuing on therapy (population at risk of a renewal lapse)
- **10** with a latent "should be suppressed" truth (therapy stopped / patient transferred / disease progressed / hospice) — these must **not** be auto-renewed
- Drugs: palbociclib (Ibrance), abemaciclib (Verzenio), ribociclib (Kisqali), olaparib (Lynparza), lenalidomide (Revlimid), enzalutamide (Xtandi), ibrutinib (Imbruvica), osimertinib (Tagrisso), everolimus (Afinitor), acalabrutinib (Calquence)
- Payers: mix of Medicare Advantage (UnitedHealthcare, Humana, Aetna, Wellcare) + Commercial (Cigna, Anthem BCBS, Aetna, UHC)

## Headline backtest — Reactive (today) vs Proactive (Auth Guardian)

| Metric | Reactive (today) | Auth Guardian (proactive) |
|---|---|---|
| Lapsed authorizations | **47 (33.6% of continuing cases)** | **0 (0.0%)** |
| No-auth claim denials | **47** | **0** |
| Therapy-gap days | **2,024** (≈43 days per lapse) | **0** |
| Should-suppress cases correctly held for review | n/a (no mechanism) | **10 / 10 (100% triage precision)** |

### What Auth Guardian delivers (deltas)

- **47 lapses avoided** (33.6% → 0%)
- **2,024 therapy-gap days eliminated**
- **47 no-auth denials avoided**
- **$470,000 dollars-at-risk protected** — *assumed avg claim value $10,000 (labeled assumption)*
- **118 staff scramble-hours saved** — *assumed 2.5 hrs per lapse recovery (labeled assumption)*
- **100% suppression triage precision** — 10/10 stopped/transferred/progressed cases flagged "do not file – review"
- **140 client-approval touches** — one human approval per continuing renewal (nothing is auto-filed without client sign-off)

**Assumptions (synthetic, labeled):** lead time `45 days` · avg claim value `$10,000` · scramble effort `2.5 h/lapse`.

> **Data-capture note:** `insuranceExpiry` (commercial plan-year end or Medicaid/MA redetermination date) is **NOT stored by Risa today**. Auth Guardian proposes capturing it at auth time from the EMR/payer portal — it is the binding trigger for a large share of lapses.

## Monthly trigger volume across the cohort

When the 150 cohort cases hit their auth/insurance trigger date (note the year-end commercial plan-year clustering, a real renewal-crunch phenomenon):

| Month | Cases | | Month | Cases |
|---|---|---|---|---|
| 2025-12 | 37 | | 2026-09 | 5 |
| 2026-02 | 3 | | 2026-10 | 7 |
| 2026-03 | 8 | | 2026-11 | 8 |
| 2026-04 | 5 | | 2026-12 | 28 |
| 2026-05 | 9 | | 2027-01 | 4 |
| 2026-06 | 8 | | 2027-02 | 7 |
| 2026-07 | 3 | | 2027-03 | 7 |
| 2026-08 | 8 | | 2027-04 | 3 |

As of the watcher date (2026-06-21), **25 cases** sit on the active worklist (within the 45-day lead window or recently lapsed, plus suppression reviews).

## Concrete example cases

### 1. Maria Alvarez (featured) — PA-20007
- 58F, metastatic HR+/HER2- breast cancer, **palbociclib (Ibrance)**, Humana Gold Plus (MA)
- Auth granted 2025-09-15 (6-mo term) → **expires 2026-03-15**; next oncology visit 2026-04-20
- **Reactive:** office only re-files at her next visit → **36-day therapy gap**, a no-auth denial on her refill, and a scramble to restore coverage.
- **Auth Guardian:** watcher fires **2026-01-29 (45 days before expiry)**, client approves, renewal packet filed on time → **zero gap, therapy uninterrupted.**

### 2. Joseph Hayes — PA-20000
- 49M, mantle cell lymphoma (C83.10), **acalabrutinib (Calquence)**, Wellcare by Allwell (MA)
- Auth expires 2026-04-05; next visit 2026-06-10 → trigger reason **auth expiring**
- **Reactive:** renewal initiated 66 days after expiry → **66-day gap** + no-auth denial.
- **Auth Guardian:** flagged at 2026-02-19, filed before expiry → no gap.

### 3. Richard Patel — PA-20020 (suppression)
- 80M, HR+/HER2- breast cancer (C50.912), **abemaciclib (Verzenio)**, Cigna Commercial PPO
- Commercial plan-year ends 2026-12-31 → trigger reason **insurance expiring**
- Latent truth: **disease progressed — off this regimen**
- **Reactive:** no signal either way.
- **Auth Guardian:** watcher would flag the trigger, but the **suppression check holds it as "do not file – review"** so staff never waste a renewal on a discontinued therapy — and it is never auto-filed.

---
*Generated from the deterministic synthetic cohort in `data.js` + `engine.js`. No real PHI.*
