# Auth Guardian — Internal Metrics & SQL (grounded in the real Risa schema)

**Purpose:** Size and validate the "Auth Guardian" idea (proactive PA continuity) against the *actual* production schema in `one-risa/`.
**Author role:** Product Data Analyst.
**Read-only:** No repo files were modified. Everything below cites real file paths + line numbers.

> **TL;DR on the three triggers**
> - **Auth-expiry (reauthorization): STORED.** Auth validity end dates live in `auth_entry_j_codes.end_date` and `auth_letter.auth_letter_end_date`, and initial-vs-renewal is captured in `auth_entry_j_codes.initiation_continuation_status`. (Both date columns are `VARCHAR`, not `DATE` — see caveats.)
> - **Insurance/coverage-expiry: WEAKLY captured.** `coverage.service_year_from/service_year_to` exist but represent the **benefit/plan year window** (often a calendar year), *not* a true policy termination date. A real "insurance about to terminate" date is **not reliably stored** in CloudSQL.
> - **Regimen/treatment change: NOT stored as a trigger/event.** It only appears *reactively* as an outcome reason code — `AuthType` enum values `treatment_plan_changed`, `drug_changed`, `drug_removed`, `insurance_changed`, `dos_changed` (written into `*.auth_status`) and `auth_status_comments`. There is no proactive "regimen changed" event table; it can only be **proxied** by diffing `medical_pa_order.regimen_name` across a patient's orders.

---

## 0. Architecture / where data lives

There are **two datastores**, and PA data is split across both.

- **CloudSQL / PostgreSQL** — the normalized, current "live" medical-PA model. Tables are created in `one-risa/utility/sql_tables/table_creation/*` and registered in `init_tables.py` (`one-risa/utility/sql_tables/table_creation/init_tables.py:55-101`). Medical PA orders are synced into Postgres from Firestore via `one-risa/utility/repositories/postgres/medical_order/sync_*`. **Dialect: PostgreSQL.**
- **BigQuery** — append-only analytics / worklist / archive layer. Pharmacy PA requests, the medical "final worklist", and Firestore archives. **Dialect: BigQuery Standard SQL.**

> **Note on `pa_submission` / `core_medical_pa` models:** The files named `.../models/medical/pa_submission.py`, `.../models/pharmacy/pa_submission.py`, and `core_medical_pa.py` are **Pydantic request/response/API models** (payer submission payloads, batch request shapes), *not* persistence schemas. The real persisted schema is the `sql_tables/table_creation/*` DDL (CloudSQL) and the BigQuery services. All SQL below targets the persisted schema.

---

## 1. DATA MAP — the real tables/columns that matter

### 1a. CloudSQL / PostgreSQL (dialect: Postgres)

| Table | Key columns (relevant) | Datastore | Represents | Source |
|---|---|---|---|---|
| `medical_pa_order` | `order_id` (PK, UUID), `patient_id`, `org_id`, `date_of_service` (VARCHAR), `regimen_name` (TEXT), `service_type` (JSONB), `location`, `practitioner_name`, `created_at` | CloudSQL | One medical PA case/order | `utility/sql_tables/table_creation/medical_pa_order.py:8-25` |
| `medical_pa_order_status` | `order_id` (PK), `master_auth_status`, `submission_status`, `nar_check_status`, `auth_on_file_completion_status`, `mark_as_completed`, `regimen_type`, `date_of_work`, `clinical_data` (JSONB), `created_at`, `updated_at` | CloudSQL | Order-level outcome/decision + workflow status | `utility/sql_tables/table_creation/medical_pa_order_status.py:11-45` |
| `auth_on_file` | `order_id` (UNIQUE), `patient_id`, `org_id`, `auth_status`, `source`, `nar_check_completed_at`, `date_of_hold_until`, `created_at`, `updated_at` | CloudSQL | Top-level "auth on file" record per order | `utility/sql_tables/table_creation/auth_on_file.py:8-27,50-54` |
| `auth_entry_j_codes` | `order_id`, `patient_id`, `j_code`, `medicine_name`, `auth_number`, `auth_status`, `auth_on_file_auth_status`, **`initiation_continuation_status`**, `coverage_status`, **`start_date` (VARCHAR)**, **`end_date` (VARCHAR)**, `comment_date`, `num_visits`, `visits_happened`, `visits_remaining`, `created_at` | CloudSQL | Per-drug (J-code) auth grant + **validity window** + initial/renewal flag | `utility/sql_tables/table_creation/auth_entry_j_codes.py:10-42` |
| `auth_letter` | `order_id`, `patient_id`, `drug_name`, `primary_insurance`, `auth_letter_auth_status`, `auth_validation_status`, **`auth_letter_start_date` (VARCHAR)**, **`auth_letter_end_date` (VARCHAR)**, `units_approved`, `calculated_visits`, `auth_initiated_date`, `num_visits`, `created_at` | CloudSQL | Parsed payer auth letter (1:1 per J-code) — authoritative validity + payer | `utility/sql_tables/table_creation/auth_letter.py:11-44` |
| `coverage` | `order_id`, `patient_id`, `member_id`, `payer_name`, `plan_name`, `coverage_type`, `coverage_status`, `active` (BOOL), **`service_year_from` (VARCHAR)**, **`service_year_to` (VARCHAR)**, `service_type`, `order_created_at`, `created_at` | CloudSQL | Patient insurance coverage + **benefit-year window** | `utility/sql_tables/table_creation/coverage.py:10-32` |
| `coverage_results` | `order_id`, `coverage_type`, `extracted_coverage` (JSONB), `raw_response` (JSONB), `status`, `ev_type`, `service_type`, `created_at` | CloudSQL | Raw eligibility-verification (EV) results | `utility/sql_tables/table_creation/coverage_results.py:10-30` |
| `auth_status_comments` | `order_id`, `patient_id`, `j_code`, `comment`, `reason`, `comment_type` (denial/query/...), `created_at` | CloudSQL | Denial/query reason audit trail | `utility/sql_tables/table_creation/auth_status_comments.py:10-21` |
| `medication_dispenses` | `order_id`, `patient_id`, `medication_text`, `medication_code`, `when_handed_over` (TS), `when_prepared`, `days_supply`, `quantity_value`, `status`, `created_at` | CloudSQL | Actual fill/dispense events (FHIR) → therapy-gap proxy | `utility/sql_tables/table_creation/medication_dispenses.py:11-32` |
| `demographics` | `patient_id`, `org_id`, `first_name`, `last_name`, `date_of_birth` (DATE) | CloudSQL | Patient demographics | `utility/sql_tables/table_creation/demographics.py:11-25` |
| `submission` | `order_id`, `patient_id`, `requesting_practitioner_details` (JSONB), `visit_details` (JSONB), `primary_diagnosis_details` (JSONB), `regimen_icd_state`, `created_at` | CloudSQL | PA submission payload detail | `utility/sql_tables/table_creation/submission.py:10-24` |
| `oncoemr_tasks` | `task_id`, `order_id`, `org_id`, `status`, `assignee_id`, `last_activity_at`, `created_at` | CloudSQL | OncoEMR task ingestion (cron-driven watcher surface) | `utility/sql_tables/table_creation/oncoemr_tasks.py:12-34` |

**Enums to know (drive `auth_status` / `master_auth_status` semantics):**
- `AuthType` — `auth_on_file`, `auth_by_risa`, `no_auth_required`, `denied_by_risa`, `existing_denial`, `denial_after_query`, `pending`, `hold`, **`treatment_plan_changed`**, **`drug_changed`**, **`drug_removed`**, **`insurance_changed`**, **`dos_changed`**, `self_pay`, `free_drug`, `on_study_patient`, etc. — `utility/models/medical/oncoemr.py:58-97`. `master_auth_status` is written from these values (`utility/services/medical/medical_order_components/order_operations.py:71,163`).
- `PaOrderStatus` — `Verified`, `Approved`, `Denied`, `Pending`, `Auth on file`, `Auth Not Required`, `Archived` — `utility/models/pharmacy/cmm.py:131-146`.
- `CmmStatus` — pharmacy PA pipeline statuses incl. `Denied`, `Verified`, `Auth on file`, `Auth Not Required` — `utility/models/pharmacy/cmm.py:97-128`.
- OncoEMR scrape model `InsuranceDetails` has `effective_date` + **`term_date`** (`utility/models/medical/oncoemr.py:147-176`) — but this is a *scraped Pydantic object*, **not** a persisted CloudSQL column. See Data-Gap §4.

### 1b. BigQuery (dialect: BigQuery Standard SQL)

| Dataset.Table | Key columns | Represents | Source |
|---|---|---|---|
| `pharmacy_pa_requests.pa_request_entries` | `identifier`, `drug`, `patient_mrn`, `patient_name`, `insuranceid`, `provider_name`, `covermymed_id`, `response_status`, `outcome`, `second_stp_status`, `onco_status`, `specialty`, `rx_due_date`, `org_id`, `filename`, `dumped_at` (TIMESTAMP, **MONTH-partitioned**) | Pharmacy PA requests (dashboard source of truth, all orgs) | `pa_order_creation/.../services/pharmacy/pa_request_bigquery_service.py:19-20,23-50,125-159` |
| `medical_pa_final_worklist.<org_id>` | `patient_id`, `patient_name`, `regimen`, `status_tracking_rpa`, `auth_status`, `primary_insurance`, `bo_value`, `location`, `date_of_service`, `upload_date`, `upload_timestamp`, `upload_id` | Medical PA worklist (table name = org_id) | `pa_order_creation/.../models/medical/bigquery_models.py:37-70,98-116` |
| `archived_data.medical_pa_orders_archive` | archived Firestore medical PA order docs (full JSON-ish) | Cold storage of aged-out medical PA orders | `pa_order_creation/.../models/medical/core_medical_pa.py:102-109` |
| `oncoemr.nycbs_sftp_sheet_records` | `seq`, `pharmacy_type`, `patient_mrn`, `patient_name`, `dob`, `insuranceid`, `provider_name`, `drug`, `pharmacy`, `bin`, `rx_due_date`, `covermymed_id`, `created_at`, `org_id` | Raw SFTP intake sheet (pharmacy) | `pa_order_creation/.../services/pharmacy/bigquery_upload_service/service.py:16,38,60-78` |
| `astera.pharmacy_astera_orders` | Astera org-specific RPA mirror | Astera RPA compatibility | `pa_request_bigquery_service.py:175-176` |

> **`project_id`** for BigQuery is injected from `app.main.resources` (`pa_request_bigquery_service.py:10`); substitute the GCP project at run time. All BQ identifiers below use the form `` `<project>.<dataset>.<table>` ``.

---

## 2. PRIMARY METRIC + SQL

> **Metric:** *"How many re-PA requests do we get annually (and monthly) due to (1) auth expiry, (2) insurance/coverage expiry, (3) regimen change?"* — split by trigger type, drug, and payer.

Because the three triggers are **not stored as first-class labels**, each is defined operationally below and given the closest real-schema query. The cleanest single source for medical PA outcomes is **CloudSQL** (`medical_pa_order` + `medical_pa_order_status` + `auth_entry_j_codes` + `auth_letter` + `coverage`), so the primary queries are **Postgres**.

### Operational definitions

| Trigger | Operational definition (real columns) | Storage status |
|---|---|---|
| **Auth expiry (reauth)** | An order whose J-code auth is a **continuation/renewal** — `auth_entry_j_codes.initiation_continuation_status` indicates continuation **OR** a *new* order for a patient+drug whose prior auth `end_date` falls just before the new `date_of_service`. | **Stored** (validity dates + init/continuation flag) |
| **Insurance/coverage expiry** | An order created in a **new benefit year** vs the patient's prior coverage window — proxied via `coverage.service_year_to`/`service_year_from`, or `master_auth_status = 'insurance_changed'`. | **Weak proxy only** (benefit-year window, not termination date) |
| **Regimen change** | `master_auth_status`/`auth_status` ∈ {`treatment_plan_changed`,`drug_changed`,`drug_removed`} **OR** `medical_pa_order.regimen_name` differs from the patient's previous order. | **Reactive reason code / diff proxy only** |

> **Date-parsing caveat (applies to every query touching auth dates):** `auth_entry_j_codes.start_date/end_date` and `auth_letter.auth_letter_*_date` are `VARCHAR(255)`. The model converters write `%m/%d/%Y` / `%m/%d/%y` (`utility/models/medical/oncoemr.py:170-175`, `:194-197`). In Postgres use `to_date(NULLIF(col,''),'MM/DD/YYYY')` wrapped defensively; in BigQuery use `SAFE.PARSE_DATE('%m/%d/%Y', col)`. All queries below assume `MM/DD/YYYY`; verify and add fallbacks for `MM/DD/YY`.

### 2.1 Primary — annual + monthly re-PA volume, split by trigger / drug / payer  *(Postgres)*

```sql
-- DIALECT: PostgreSQL (CloudSQL). Re-PA volume by trigger type, drug, payer.
-- Window: trailing 24 months. Adjust :start / :end as needed.
WITH base AS (
    SELECT
        o.order_id,
        o.patient_id,
        o.org_id,
        o.regimen_name,
        o.created_at,
        date_trunc('month', o.created_at)               AS pa_month,
        date_trunc('year',  o.created_at)               AS pa_year,
        s.master_auth_status,
        -- drug: prefer the J-code medicine name, fall back to order regimen
        COALESCE(jc.medicine_name, o.regimen_name)      AS drug,
        COALESCE(al.primary_insurance, cov.payer_name)  AS payer,
        jc.initiation_continuation_status,
        -- prior auth validity end for this patient+drug (auth-expiry signal)
        to_date(NULLIF(jc.end_date, ''), 'MM/DD/YYYY')  AS auth_end_date,
        cov.service_year_to,
        cov.service_year_from
    FROM medical_pa_order o
    LEFT JOIN medical_pa_order_status s ON s.order_id = o.order_id
    LEFT JOIN auth_entry_j_codes jc     ON jc.order_id = o.order_id
    LEFT JOIN auth_letter al            ON al.order_id = o.order_id
                                        AND lower(al.drug_name) = lower(jc.medicine_name)
    LEFT JOIN coverage cov              ON cov.order_id = o.order_id
    WHERE o.created_at >= now() - interval '24 months'
),
classified AS (
    SELECT
        b.*,
        CASE
            -- (1) Auth-expiry / reauth: explicit continuation flag,
            --     OR an order arriving on/after a prior auth's end date.
            WHEN lower(coalesce(b.initiation_continuation_status,'')) LIKE '%continuat%'
              OR lower(coalesce(b.initiation_continuation_status,'')) LIKE '%renew%'
              OR lower(coalesce(b.initiation_continuation_status,'')) LIKE '%reauth%'
                THEN 'auth_expiry_reauth'
            -- (3) Regimen change: reason code captured reactively in auth status
            WHEN lower(coalesce(b.master_auth_status,'')) IN
                 ('treatment_plan_changed','drug_changed','drug_removed','dos_changed')
                THEN 'regimen_change'
            -- (2) Insurance change: reason code captured reactively
            WHEN lower(coalesce(b.master_auth_status,'')) = 'insurance_changed'
                THEN 'insurance_expiry_change'
            ELSE 'initial_or_unclassified'
        END AS trigger_type
    FROM base b
)
SELECT
    pa_year,
    pa_month,
    trigger_type,
    drug,
    payer,
    COUNT(*) AS re_pa_count
FROM classified
GROUP BY ROLLUP (pa_year, pa_month, trigger_type, drug, payer)
ORDER BY pa_year, pa_month, re_pa_count DESC;
```

**Annual headline** (collapse to year × trigger):

```sql
-- DIALECT: PostgreSQL. Annual re-PA counts by trigger type only.
SELECT date_part('year', created_at) AS yr,
       CASE
         WHEN lower(coalesce(jc.initiation_continuation_status,'')) ~ 'continuat|renew|reauth'
              THEN 'auth_expiry_reauth'
         WHEN lower(coalesce(s.master_auth_status,'')) IN
              ('treatment_plan_changed','drug_changed','drug_removed','dos_changed')
              THEN 'regimen_change'
         WHEN lower(coalesce(s.master_auth_status,'')) = 'insurance_changed'
              THEN 'insurance_expiry_change'
         ELSE 'initial_or_unclassified'
       END AS trigger_type,
       COUNT(DISTINCT o.order_id) AS orders
FROM medical_pa_order o
LEFT JOIN medical_pa_order_status s ON s.order_id = o.order_id
LEFT JOIN auth_entry_j_codes jc     ON jc.order_id = o.order_id
GROUP BY 1, 2
ORDER BY 1, 4 DESC;
```

### 2.2 Auth-expiry trigger — derivation-based proxy (does NOT rely on a stored label)  *(Postgres)*

The most defensible reauth signal: for each patient+drug, find a **later** approved order whose `date_of_service` lands within N days *after* the prior auth's `end_date`. This reconstructs the "auth about to expire → new PA" pattern from validity dates alone.

```sql
-- DIALECT: PostgreSQL. Reauthorization events derived from auth validity windows.
WITH auths AS (
    SELECT o.patient_id, o.org_id,
           jc.medicine_name AS drug,
           COALESCE(al.primary_insurance, cov.payer_name) AS payer,
           o.order_id, o.date_of_service,
           to_date(NULLIF(o.date_of_service,''),'MM/DD/YYYY')      AS dos,
           to_date(NULLIF(jc.start_date,''),'MM/DD/YYYY')          AS auth_start,
           to_date(NULLIF(jc.end_date,''),'MM/DD/YYYY')            AS auth_end
    FROM medical_pa_order o
    JOIN auth_entry_j_codes jc ON jc.order_id = o.order_id
    LEFT JOIN auth_letter al   ON al.order_id = o.order_id
    LEFT JOIN coverage cov     ON cov.order_id = o.order_id
    WHERE jc.end_date IS NOT NULL AND jc.end_date <> ''
),
seq AS (
    SELECT a.*,
           LAG(auth_end) OVER (PARTITION BY patient_id, drug ORDER BY dos) AS prev_auth_end
    FROM auths a
)
SELECT date_part('year', dos) AS yr, drug, payer,
       COUNT(*) AS reauth_events
FROM seq
WHERE prev_auth_end IS NOT NULL
  AND dos BETWEEN prev_auth_end - INTERVAL '45 days' AND prev_auth_end + INTERVAL '60 days'
GROUP BY 1,2,3
ORDER BY 1, reauth_events DESC;
```

### 2.3 Insurance/coverage-expiry trigger — proxy  *(Postgres)*

True termination dates are not stored; the best available is the benefit-year window (`service_year_to`) and the `insurance_changed` reason. This counts orders that begin a new coverage year for a patient (clustering signal) plus explicit insurance-change reasons.

```sql
-- DIALECT: PostgreSQL. Coverage-driven re-PA proxy.
WITH cov AS (
    SELECT o.order_id, o.patient_id, o.created_at,
           cov.payer_name, cov.member_id,
           NULLIF(cov.service_year_to,'')   AS svc_year_to,
           NULLIF(cov.service_year_from,'') AS svc_year_from,
           s.master_auth_status
    FROM medical_pa_order o
    JOIN coverage cov ON cov.order_id = o.order_id
    LEFT JOIN medical_pa_order_status s ON s.order_id = o.order_id
)
SELECT date_part('year', created_at) AS yr,
       payer_name,
       COUNT(*) FILTER (WHERE lower(coalesce(master_auth_status,'')) = 'insurance_changed')
           AS insurance_change_reason_orders,
       COUNT(DISTINCT member_id)  AS distinct_members,
       COUNT(*)                   AS orders_with_coverage
FROM cov
GROUP BY 1,2
ORDER BY 1, orders_with_coverage DESC;
```

### 2.4 Regimen-change trigger — diff proxy (no stored event)  *(Postgres)*

```sql
-- DIALECT: PostgreSQL. Regimen change detected by diffing consecutive orders per patient.
WITH ordered AS (
    SELECT o.order_id, o.patient_id, o.org_id, o.created_at,
           o.regimen_name,
           LAG(o.regimen_name) OVER (PARTITION BY o.patient_id ORDER BY o.created_at) AS prev_regimen
    FROM medical_pa_order o
)
SELECT date_part('year', created_at) AS yr,
       COUNT(*) AS regimen_change_orders
FROM ordered
WHERE prev_regimen IS NOT NULL
  AND lower(trim(regimen_name)) <> lower(trim(prev_regimen))
GROUP BY 1
ORDER BY 1;
-- Cross-check against the reactive reason code:
-- ... WHERE lower(master_auth_status) IN ('treatment_plan_changed','drug_changed','drug_removed')
```

### 2.5 Pharmacy-side cross-check  *(BigQuery Standard SQL)*

Medical PA lives in CloudSQL; pharmacy PA volume lives in BigQuery. Use this to size pharmacy re-PA throughput by drug/payer.

```sql
-- DIALECT: BigQuery Standard SQL.
SELECT
    EXTRACT(YEAR  FROM dumped_at) AS yr,
    EXTRACT(MONTH FROM dumped_at) AS mo,
    drug,
    insuranceid AS payer,
    COUNTIF(LOWER(COALESCE(outcome,'')) LIKE '%approv%')               AS approved,
    COUNTIF(LOWER(COALESCE(response_status,'')) LIKE '%deni%')         AS denied,
    COUNT(*)                                                           AS total_requests
FROM `<project>.pharmacy_pa_requests.pa_request_entries`
WHERE dumped_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
GROUP BY yr, mo, drug, payer
ORDER BY yr, mo, total_requests DESC;
```

---

## 3. SUPPORTING / VALIDATION METRICS + SQL

Each metric carries a one-line rationale. Dialect noted per query.

### 3.1 Total approved PAs / year  *(Postgres)*
*Rationale: denominator for every Auth Guardian ratio.*
```sql
-- DIALECT: PostgreSQL
SELECT date_part('year', s.updated_at) AS yr, COUNT(*) AS approved_orders
FROM medical_pa_order_status s
WHERE lower(coalesce(s.master_auth_status,'')) IN
      ('auth_on_file','auth_by_risa','no_auth_required')   -- approval-like AuthType values
GROUP BY 1 ORDER BY 1;
```

### 3.2 Renewal/reauth share vs initial  *(Postgres)*
*Rationale: Auth Guardian's core TAM is the renewal slice; quantify it.*
```sql
-- DIALECT: PostgreSQL
SELECT
  CASE WHEN lower(coalesce(initiation_continuation_status,'')) ~ 'continuat|renew|reauth'
       THEN 'renewal' ELSE 'initial_or_unknown' END AS kind,
  COUNT(*) AS j_code_entries,
  ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER (),1) AS pct
FROM auth_entry_j_codes
GROUP BY 1;
```

### 3.3 % of approvals that carry a stored auth-expiry date  *(Postgres)*
*Rationale: directly measures whether the auth-expiry trigger is operable today.*
```sql
-- DIALECT: PostgreSQL
SELECT
  COUNT(*)                                                              AS approved_jcodes,
  COUNT(*) FILTER (WHERE NULLIF(end_date,'') IS NOT NULL)               AS with_end_date,
  ROUND(100.0*COUNT(*) FILTER (WHERE NULLIF(end_date,'') IS NOT NULL)/NULLIF(COUNT(*),0),1) AS pct_with_expiry
FROM auth_entry_j_codes
WHERE lower(coalesce(auth_status,'')) IN ('auth_on_file','auth_by_risa','approved');
```

### 3.4 Distribution of auth validity duration  *(Postgres)*
*Rationale: tells us the lookahead window the watcher must use (30/60/90 days).*
```sql
-- DIALECT: PostgreSQL
WITH d AS (
  SELECT (to_date(NULLIF(end_date,''),'MM/DD/YYYY')
        - to_date(NULLIF(start_date,''),'MM/DD/YYYY')) AS validity_days
  FROM auth_entry_j_codes
  WHERE NULLIF(start_date,'') IS NOT NULL AND NULLIF(end_date,'') IS NOT NULL
)
SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY validity_days) AS p25,
       percentile_cont(0.50) WITHIN GROUP (ORDER BY validity_days) AS median,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY validity_days) AS p75,
       AVG(validity_days) AS mean_days
FROM d WHERE validity_days BETWEEN 0 AND 730;
```

### 3.5 Denials attributable to "no auth on file / expired auth"  *(Postgres)*
*Rationale: the avoidable-denial pool Auth Guardian claims to prevent.*
```sql
-- DIALECT: PostgreSQL
SELECT date_part('year', created_at) AS yr,
       COUNT(*) AS expiry_related_denials
FROM auth_status_comments
WHERE comment_type ILIKE '%denial%'
  AND ( reason  ILIKE '%no auth%' OR reason  ILIKE '%expired%'
     OR reason  ILIKE '%authoriz%' OR comment ILIKE '%expired auth%'
     OR comment ILIKE '%no authorization on file%')
GROUP BY 1 ORDER BY 1;
-- Cross-check via status: master_auth_status IN ('existing_denial','denial_after_query','denied_by_risa')
```

### 3.6 Therapy-gap proxy (fill gap around renewal)  *(Postgres)*
*Rationale: quantifies patient harm/continuity risk the product prevents.*
```sql
-- DIALECT: PostgreSQL. Gap between consecutive dispenses per patient+drug.
WITH fills AS (
  SELECT patient_id, medication_code, medication_text, when_handed_over,
         LAG(when_handed_over) OVER (PARTITION BY patient_id, medication_code
                                     ORDER BY when_handed_over) AS prev_fill
  FROM medication_dispenses
  WHERE when_handed_over IS NOT NULL
)
SELECT medication_text,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY (when_handed_over - prev_fill)) AS median_gap,
       COUNT(*) FILTER (WHERE (when_handed_over - prev_fill) > INTERVAL '60 days') AS gaps_over_60d
FROM fills WHERE prev_fill IS NOT NULL
GROUP BY 1 ORDER BY gaps_over_60d DESC;
```

### 3.7 Time-to-reauthorization  *(Postgres)*
*Rationale: baseline cycle time; Auth Guardian aims to drive it negative (ahead of expiry).*
```sql
-- DIALECT: PostgreSQL. Days from prior auth end to next order's submission.
WITH seq AS (
  SELECT o.patient_id, jc.medicine_name,
         to_date(NULLIF(jc.end_date,''),'MM/DD/YYYY') AS auth_end,
         o.created_at AS next_pa_created,
         LEAD(o.created_at) OVER (PARTITION BY o.patient_id, jc.medicine_name
                                  ORDER BY o.created_at) AS following_pa
  FROM medical_pa_order o JOIN auth_entry_j_codes jc ON jc.order_id = o.order_id
)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (following_pa - auth_end::timestamptz)) AS median_days_to_reauth
FROM seq WHERE auth_end IS NOT NULL AND following_pa IS NOT NULL;
```

### 3.8 Regimen-change frequency per patient  *(Postgres)*
*Rationale: sizes the regimen-change trigger and watcher load.*
```sql
-- DIALECT: PostgreSQL
WITH ordered AS (
  SELECT patient_id, regimen_name,
         LAG(regimen_name) OVER (PARTITION BY patient_id ORDER BY created_at) AS prev
  FROM medical_pa_order
)
SELECT COUNT(*) FILTER (WHERE prev IS NOT NULL AND lower(trim(regimen_name))<>lower(trim(prev)))
       ::float / NULLIF(COUNT(DISTINCT patient_id),0) AS regimen_changes_per_patient
FROM ordered;
```

### 3.9 Likely-suppress cases (discontinued / transferred / hospice / self-pay / study)  *(Postgres)*
*Rationale: Auth Guardian must NOT file these; size the suppression set.*
```sql
-- DIALECT: PostgreSQL
SELECT lower(master_auth_status) AS status, COUNT(*) AS orders
FROM medical_pa_order_status
WHERE lower(coalesce(master_auth_status,'')) IN
      ('drug_removed','self_pay','free_drug','on_study_patient','not_to_work',
       'not_applicable','patient_owned_drug','pod','gold_bag')
GROUP BY 1 ORDER BY orders DESC;
-- (AuthType values: utility/models/medical/oncoemr.py:58-97)
```

### 3.10 Year-end coverage-renewal clustering  *(Postgres)*
*Rationale: tests the insurance-expiry trigger's Q4/Q1 seasonality assumption.*
```sql
-- DIALECT: PostgreSQL
SELECT date_part('month', created_at) AS mo,
       COUNT(*) FILTER (WHERE lower(coalesce(s.master_auth_status,'')) = 'insurance_changed')
           AS insurance_change_orders,
       COUNT(*) AS all_orders
FROM medical_pa_order o
LEFT JOIN medical_pa_order_status s ON s.order_id = o.order_id
GROUP BY 1 ORDER BY 1;
```

### 3.11 Medical worklist outcome mix  *(BigQuery Standard SQL)*
*Rationale: independent validation of approval/denial mix at org scale.*
```sql
-- DIALECT: BigQuery Standard SQL. Table name = org_id.
SELECT auth_status, primary_insurance, regimen, COUNT(*) AS n
FROM `<project>.medical_pa_final_worklist.<org_id>`
WHERE upload_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
GROUP BY auth_status, primary_insurance, regimen
ORDER BY n DESC;
```

---

## 4. DATA-GAP CALLOUTS (critical)

The product pitch claims **insurance-expiry** and **regimen-change** are not stored today. Verified against the models — findings:

1. **Auth-expiry — CAPTURED (usable).**
   - Validity end dates: `auth_entry_j_codes.end_date` (`auth_entry_j_codes.py:31`) and `auth_letter.auth_letter_end_date` (`auth_letter.py:27`).
   - Initial vs renewal: `auth_entry_j_codes.initiation_continuation_status` (`auth_entry_j_codes.py:23`).
   - **Gap (quality, not existence):** dates are `VARCHAR`, not `DATE`/`TIMESTAMP`, so they are not query-safe without parsing and can hold malformed values. **Recommend:** add typed `auth_valid_from DATE` / `auth_valid_to DATE` columns (or a dedicated `authorizations` table with a proper expiry index) to make a watcher reliable. Run §3.3 to see real coverage of `end_date` on approvals before committing.

2. **Insurance/coverage-expiry — NOT reliably stored.**
   - What exists: `coverage.service_year_from` / `service_year_to` (`coverage.py:21-22`) = **benefit/plan-year window** (frequently a calendar year), and `coverage.active` (bool) + `coverage_status`. The OncoEMR scrape object `InsuranceDetails.term_date` exists in code (`oncoemr.py:155`) **but has no corresponding persisted CloudSQL column** (no insurance/coverage column named `term_date`; the `coverage` table tracks only the service-year window). `insurance_changed` exists only as a *reactive* `AuthType` outcome (`oncoemr.py:80`).
   - **Conclusion:** A true "policy terminates on date X" signal is **not captured**. Only a coarse benefit-year-end proxy and a post-hoc reason code are available.
   - **Recommend:** persist `coverage.term_date` / `policy_end_date` (DATE) from the EV/OncoEMR scrape (the data is fetched but dropped), plus a real coverage effective date.

3. **Regimen/treatment change — NOT stored as an event/trigger.**
   - What exists: `medical_pa_order.regimen_name` per order (`medical_pa_order.py:19`) — so changes can only be **derived by diffing** consecutive orders (§2.4). Reactive outcome reasons `treatment_plan_changed`, `drug_changed`, `drug_removed`, `dos_changed` exist as `AuthType` values written to `*.auth_status` (`oncoemr.py:77-81`) and may appear in `auth_status_comments.reason`.
   - **Conclusion:** There is **no proactive regimen-change detector/event**; today it is only knowable after a case is worked, or by self-joining order history.
   - **Recommend:** capture a per-patient regimen timeline (effective-dated `treatment_plan`/`regimen_version` rows) so a change can fire a trigger *before* the next cycle.

4. **No explicit decision/decision-date column.** Outcomes are inferred from `master_auth_status` (CloudSQL) or `outcome`/`response_status` (BigQuery pharmacy); the closest timestamp is `medical_pa_order_status.updated_at`. There is no dedicated `decision_date`. **Recommend:** add `decision`/`decision_at` to `medical_pa_order_status` for clean cycle-time analytics.

5. **Cross-store join friction.** Medical PA = CloudSQL (`patient_id` = MRN, `order_id` = UUID); pharmacy PA = BigQuery (`patient_mrn`, `covermymed_id`). There is no shared surrogate key across stores — patient-level joins must go through MRN + org, which is fuzzy. Account for this when combining medical + pharmacy TAM.

---

## 5. HOW TO RUN + CAVEATS

### How to run
- **Postgres queries:** run against the CloudSQL PostgreSQL instance used by `one-risa` (connection via `utility/providers/cloudsql/connection_manager.py`; client in `utility/providers/cloudsql/client.py`). Row-Level Security is enabled — these are tenant-scoped by `org_id`. For cross-org analytics you must run with an RLS-bypass / admin role (see `utility/providers/cloudsql/RLS_GUIDE.md` and `set_rls_bypass()` used in `init_tables.py:123`). Otherwise add `WHERE org_id = :org_id`.
- **BigQuery queries:** run in the GCP project from `app.main.resources.project_id`. Replace `<project>` and, for the medical worklist, `<org_id>` (the table name **is** the org id, e.g. default `HhwIHO4npKhrxyylkC33` — `bigquery_models.py:70`). `pa_request_entries` is **MONTH-partitioned on `dumped_at`** — always filter on `dumped_at` to limit scan cost.

### Caveats / assumptions
- **Date columns are strings.** `auth_entry_j_codes.start_date/end_date`, `auth_letter.auth_letter_*_date`, `medical_pa_order.date_of_service`, `coverage.service_year_*` are `VARCHAR`. Queries assume `MM/DD/YYYY`; validate format and add `MM/DD/YY` fallbacks. Wrap parses in `NULLIF(col,'')` and (BigQuery) `SAFE.PARSE_DATE`.
- **Approval/denial status values are assumptions** mapped from the `AuthType`/`PaOrderStatus`/`CmmStatus` enums (`oncoemr.py:58-97`, `cmm.py:97-146`). Confirm the exact stored casing/spelling of `master_auth_status` in production before trusting absolute counts — values may be stored lowercased (enum value) or title-cased (display).
- **Trigger classification is heuristic.** `auth_expiry_reauth`, `insurance_expiry_change`, `regimen_change` are *derived*, not labeled. Counts are directional sizing, not audited ground truth. The derivation-based reauth query (§2.2) is the most defensible; the reason-code queries undercount (they only catch cases that were worked and reason-tagged).
- **`auth_letter` join key** uses `lower(drug_name) = lower(medicine_name)`; if a drug name normalizes differently between tables, some auth-letter dates will not join — fall back to `auth_entry_j_codes.end_date` alone.
- **CloudSQL vs Firestore freshness.** CloudSQL is populated by sync jobs (`utility/repositories/postgres/medical_order/sync_*`); very recent Firestore orders may lag. Aged orders are moved to `archived_data.medical_pa_orders_archive` (BigQuery) and will be absent from CloudSQL — for true multi-year history, UNION the archive.
- **Coverage `service_year_to` ≠ termination.** Do not present §2.3 as real insurance expiry; it is a benefit-year proxy (see Data-Gap §2).
- **Watcher feasibility:** §3.4 (validity-duration distribution) + §3.3 (% with stored expiry) should be run first — they determine whether an auth-expiry watcher is viable on today's data and what lookahead window to use.
