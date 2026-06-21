# Auth Guardian Research Brief

## 1. Problem

### Prior authorization is already a high-friction workflow

Prior authorization (PA) is one of the most persistent administrative bottlenecks in US specialty care. The AMA's late-2024 PA survey reports that physicians complete about **39 PAs per physician per week**, consuming about **13 hours of physician and staff time weekly**. Forty percent of practices report staff working exclusively on PA, while **89%** say PA increases physician burnout and **88%** say PA increases overall health care utilization. [1][2]

For oncology, the burden is not just administrative. It becomes a continuity-of-therapy risk.

ASTRO's 2024 oncology PA survey found that **92% of radiation oncologists** report PA causes treatment delays, affecting an average of **35% of patients**. Among reported delays, **68% last 5+ days**, up from 52% in 2020. The same survey reports that **30%** of physicians observed PA leading to an ER visit, hospitalization, or permanent disability, and **7%** report that PA contributed to a patient death. [3][4][5]

### Oncology PA delays create direct therapy-gap risk

In oral oncology, continuity matters because authorization status can block the next fill. A JCO study of Medicare Part D oral anticancer drugs from 2010-2020 found that imposing a new PA on an established therapy increased the odds of discontinuation within 120 days by about **7.1x** and increased time-to-next-fill by about **9.7 days**. [6]

This is exactly the failure mode Auth Guardian targets: not the initial PA, but the moment when an approved therapy quietly becomes vulnerable again because the authorization, insurance coverage, or regimen record has changed.

### The operational failure is renewal timing

Oncology reauthorization playbooks describe oral oncolytics and biologics as requiring reauthorization every **3-12 months**, often around cycle or coverage milestones. Recommended practice is to submit renewals **3-8 weeks before expiry**. The common operational failure is waiting until the patient's next appointment or refill event to notice the renewal need. [10][11]

Risa's current BOSS workflow is powerful but reactive:

- Client sends an SFTP batch.
- Risa pulls EMR data from OncoEMR.
- Risa identifies the correct form using pharmacy benefit details such as BIN, PCN, and Group.
- Risa fills and submits through CoverMyMeds.
- Risa handles QA, tracks approve/deny, and writes notes back.

The current workflow stops at tracking approve/deny. It does not continuously protect the authorization after approval.

### Auth Guardian reframes PA as continuity protection

Auth Guardian adds a proactive trigger-and-execution layer on top of Risa's existing engine:

- **Auth-expiry trigger:** use Risa's own PA approval records where expiration dates may already exist.
- **Insurance/coverage-expiry trigger:** read coverage dates from the EMR, which are not stored today.
- **Regimen-change trigger:** re-check the EMR monthly for regimen changes, lower priority than expiry triggers.

The product does not auto-file renewals. It highlights upcoming trigger cases, asks the client to approve action, and only then files the renewal through Risa's existing PA engine.

## 2. Current Solutions + Shortcomings

### What practices use today

Most oncology practices already have some way to notice authorization risk:

- **Manual auth-log spreadsheets:** staff-maintained lists of approval dates, expiration dates, drug names, payer details, and follow-up status.
- **Practice management / RCM auth-tracking modules:** workqueues that associate authorization status with scheduled visits, billing, and claims.
- **Eligibility and benefit modules:** payer eligibility checks that can show coverage changes or insurance termination.
- **EHR task and reminder queues:** ticklers, staff messages, worklists, and appointment-linked reminders.
- **Payer portals and CoverMyMeds status tracking:** direct payer/PBM status views, renewal prompts, and case-level follow-up.

These tools can help detect work. They do not reliably execute the renewal before the deadline.

### Adjacent vendor landscape

Adjacent vendors address different parts of the PA and revenue-cycle workflow:

- **Cohere Health:** payer-facing and provider-facing authorization workflows, with emphasis on utilization management and clinical policy automation.
- **Rhyme:** prior authorization workflow automation and payer-provider connectivity.
- **Myndshft:** automated benefits verification and prior authorization submission.
- **Waystar:** revenue-cycle platform with eligibility, authorization, claims, and denial-management capabilities.
- **Availity:** payer-provider network for eligibility, authorizations, claims, and status transactions.
- **Infinitus:** voice AI for payer calls and administrative follow-up.
- **Develop Health:** AI-enabled benefits verification and PA support.
- **Tennr / Latent:** document intake and workflow automation for health care operations.
- **Co:Helm:** AI workflow automation for provider operations.
- **Anterior:** AI-supported clinical review and prior authorization workflows.

The common pattern: these systems reduce friction in pieces of the workflow, but they do not sit inside Risa's specific oncology PA loop with the EMR context, prior approval record, form-selection logic, payer-question history, and submission engine already connected.

### The shortcoming: detection-only is not enough

The market already has alerts, queues, reminders, eligibility checks, and status dashboards. Yet delays persist and appear to be worsening in oncology: ASTRO reports the share of delays lasting 5+ days rose from 52% in 2020 to 68% in 2024. [3]

That is evidence that the bottleneck is not simply knowing that PA work exists. The bottleneck is execution:

- assembling the latest clinical evidence,
- confirming therapy should continue,
- drafting the renewal,
- selecting the payer form,
- submitting the case,
- answering payer clinical questions,
- clearing QA,
- tracking approve/deny before the deadline,
- and writing the outcome back into the care record.

Auth Guardian's wedge is therefore not "better reminders." It is "detected early, client-approved, then executed through the engine that already files oncology PAs."

## 3. Market Size

### Core sizing metric

Auth Guardian should be sized around the monthly number of trigger cases per practice and the dollars at risk behind those triggers.

Formula:

```text
Monthly trigger cases =
  active oral-oncolytic PA patients
  x monthly trigger rate
  x actionable share after suppression

Dollars at risk =
  monthly trigger cases
  x historical lapse rate
  x average claim value

Staff hours at risk =
  monthly trigger cases
  x historical lapse rate
  x staff hours per lapse
```

Prototype unit economics to keep constant:

- Average claim value: **$10,000** assumption.
- Historical reactive lapse rate: **33.6%** from synthetic prototype cohort.
- Staff time per lapse: **2.5 hours** assumption.
- All-in PA handling cost: **$50-150 per PA**, consistent with cited industry estimates. [8][9]
- Auth Guardian lead time: **45 days**.

### Prototype benchmark

Synthetic deterministic cohort:

- 150 approved oral-oncolytic PAs.
- 140 continuing; 10 should suppress.
- Reactive baseline: 47 lapses, 47 no-auth denials, 2,024 therapy-gap days.
- Auth Guardian: 0 lapses, 10/10 suppression triage, 140 client-approval touches, no auto-filing.

Implication:

- Protected claim value: **47 x $10,000 = $470,000**.
- Staff-hours saved: **47 x 2.5 = 118 hours**.
- Therapy-gap days avoided: **2,024 days** in the prototype cohort.

### Base-case worked example: one oncology practice

Clearly labeled assumptions:

- Active oral-oncolytic PA patients per practice: **750**.
- Monthly trigger rate: **12%** of active patients.
- Suppression / not-ready share: **7%**, consistent with prototype suppression of 10 out of 150.
- Actionable share after suppression: **93%**.

Calculation:

```text
Monthly trigger cases = 750 x 12% x 93% = 84
Expected reactive lapses = 84 x 33.6% = 28
Dollars at risk = 28 x $10,000 = $280,000/month
Staff hours at risk = 28 x 2.5 = 70 hours/month
```

Base-case headline: a large oncology practice may see about **84 actionable Auth Guardian trigger cases per month**, representing about **$280K/month in protected claim value** and **70 staff-hours/month** of avoidable rework risk.

### Sensitivity: per-practice monthly opportunity

| Scenario | Active oral-oncolytic PA patients | Monthly trigger rate | Actionable trigger cases / month | Expected lapses prevented | Claim value protected / month |
|---|---:|---:|---:|---:|---:|
| Low | 400 | 8% | 30 | 10 | $100,000 |
| Base | 750 | 12% | 84 | 28 | $280,000 |
| High | 1,200 | 16% | 179 | 60 | $600,000 |

Notes:

- Actionable trigger cases assume 93% proceed after suppression triage.
- Expected lapses prevented use the prototype historical lapse rate of 33.6%.
- Claim value protected uses the prototype assumption of $10,000 per claim.

### Risa book: NYCBS + Astera

Clearly labeled placeholder assumptions:

- NYCBS active oral-oncolytic PA patients: **1,200**.
- Astera active oral-oncolytic PA patients: **750**.
- Combined active oral-oncolytic PA patients: **1,950**.
- Base monthly trigger rate: **12%**.
- Actionable share after suppression: **93%**.

Calculation:

```text
Monthly trigger cases = 1,950 x 12% x 93% = 218
Expected reactive lapses = 218 x 33.6% = 73
Claim value protected = 73 x $10,000 = $730,000/month
Staff hours saved = 73 x 2.5 = 183 hours/month
```

Risa-book headline: across NYCBS and Astera under these assumptions, Auth Guardian could surface about **218 actionable trigger cases per month**, protecting roughly **$730K/month** in oncology claim value and avoiding about **183 staff-hours/month** of lapse rework.

Annualized:

- Actionable trigger cases: **2,616/year**.
- Claim value protected: **$8.8M/year**.
- Staff-hours saved: **2,196/year**.

### US community-oncology TAM

This TAM is intentionally modest and caveated because it uses placeholder assumptions rather than a claimed national patient count.

Assumptions:

- Addressable US community-oncology practices / sites for this product motion: **500-1,500**.
- Base active oral-oncolytic PA patients per practice: **750**.
- Base actionable triggers per practice per month: **84**.
- Monetization proxy: **$100 per completed trigger case**, within the cited $50-150 all-in PA cost range and below the $10,000 protected-claim assumption. [8][9]

TAM ladder:

| Level | Assumption | Actionable triggers / month | Revenue proxy |
|---|---:|---:|---:|
| One practice | 84 triggers/month | 84 | $8.4K/month; $101K/year |
| Risa current book | NYCBS + Astera placeholder | 218 | $21.8K/month; $262K/year |
| US low TAM | 500 practices | 42,000 | $4.2M/month; $50M/year |
| US base TAM | 1,000 practices | 84,000 | $8.4M/month; $101M/year |
| US high TAM | 1,500 practices | 126,000 | $12.6M/month; $151M/year |

Value-at-risk lens at base TAM:

```text
84,000 monthly trigger cases x 33.6% lapse rate x $10,000 claim value
= $282M/month in claim value at risk
= $3.4B/year in claim value at risk
```

The revenue proxy is not a pricing recommendation. It is a sizing bridge that keeps monetization anchored to the real operational cost of PA work while showing the much larger claim-continuity value protected.

### External triangulation

The bottom-up model is consistent with the external market context:

- PA volume is high: AMA reports about 39 PAs per physician per week. [1][2]
- Oncology delay burden is severe: ASTRO reports PA-related treatment delays for 92% of radiation oncologists. [3]
- Renewal timing is a known operational issue for oral oncolytics and biologics. [10][11]
- Claim denial and rework economics are material: authorization / pre-certification contributes roughly 12-13% of claim denials, many denied claims are never reworked, and rework can cost $25-118 per claim. [8][9]
- Medicare Advantage PA volume is large: cited KFF-based analysis reports roughly 53 million PA requests in 2024, a 7.7% partial/full denial rate, low appeal rates, and high overturn rates among appealed denials. [7]

## 4. Why Risa Wins + Why Now

### Why Risa wins

Risa is not starting from a blank workflow. It already sits in the exact loop Auth Guardian needs:

- **Inside the EMR context:** Risa can pull clinical and insurance data from OncoEMR.
- **Inside the PA execution flow:** Risa already identifies forms, fills cases, submits through CoverMyMeds, handles QA, answers payer questions, tracks approve/deny, and writes notes back.
- **Inside the client operating model:** clients already trust Risa to run PA work after a batch arrives.
- **No new system integration:** Auth Guardian uses existing EMR access and Risa PA records; it adds trigger logic, prioritization, and client approval.
- **Execution wedge:** competitors and internal tools can flag work, but Risa can execute the renewal through the existing oncology PA engine.
- **Additive revenue:** proactive continuity cases create a new recurring workflow without cannibalizing initial PA automation.
- **Fast to ship:** the MVP can start with auth-expiry, add coverage-expiry from the EMR, then layer regimen-change checks later.

### Why now

The regulatory environment is pushing payers toward faster, more transparent PA workflows, which makes provider-side readiness more valuable.

CMS finalized the Interoperability and Prior Authorization Final Rule, CMS-0057-F, in January 2024. Impacted payers, including Medicare Advantage organizations, Medicaid and CHIP managed care plans, state Medicaid and CHIP fee-for-service programs, and ACA marketplace qualified health plan issuers, must support prior-authorization APIs and faster decision timelines, with implementation phases through 2026 and 2027. The rule sets decision timeframes of 72 hours for urgent requests and 7 calendar days for standard requests for certain impacted payers. [12]

State gold-card laws, such as Texas HB 3459, exempt qualifying high-approval physicians from certain PA requirements. Federal gold-card proposals, including the AMA-backed GOLD CARD Act for Medicare Advantage, reflect the same policy direction, though current proposals are narrower than the pharmacy-benefit drug workflow Auth Guardian targets. [13][14]

The tailwind: payer PA infrastructure is modernizing, but oncology practices still need provider-side systems that detect renewal risk early and execute correctly before the therapy gap happens.

## 5. Suggested Deck Content

### Slide 1: Problem

- Oncology PA is not just paperwork. It can interrupt active cancer therapy.
- AMA: about 39 PAs per physician per week and 13 hours of staff time weekly.
- ASTRO: 92% of radiation oncologists report PA-related treatment delays; 68% of delays last 5+ days.
- JCO oral-oncology evidence: a new PA on an established oral anticancer drug increased discontinuation odds about 7x and delayed next fill by about 10 days.
- Risa solves the initial PA workflow. The gap is keeping approvals alive after they are granted.

### Slide 2: Current Solutions + Shortcomings

- Practices already use spreadsheets, EHR reminders, RCM workqueues, eligibility checks, payer portals, and CoverMyMeds status tracking.
- Adjacent vendors automate pieces of PA, eligibility, RCM, document intake, payer calls, and clinical review.
- These tools mostly detect work. They do not reliably execute oncology renewals before the deadline.
- The hard part is assembling evidence, confirming continuation, drafting the renewal, submitting, answering payer questions, clearing QA, and writing back the result.
- Auth Guardian is not another reminder. It is early detection plus client-approved execution through Risa's existing PA engine.

### Slide 3: Market Size

- Core metric: monthly trigger cases per practice.
- Base-case assumption: 750 active oral-oncolytic PA patients, 12% monthly trigger rate, 93% actionable after suppression.
- Result: about 84 actionable trigger cases per practice per month.
- Prototype economics: 33.6% reactive lapse rate, $10K average claim value, 2.5 staff-hours per lapse.
- Base practice value: about $280K/month in protected claim value and 70 staff-hours/month of avoided rework risk.
- Risa-book placeholder for NYCBS + Astera: about 218 actionable triggers/month, about $730K/month protected, about 183 staff-hours/month saved.
- Modest US community-oncology TAM proxy: about $101M/year at 1,000 practices and $100 per completed trigger case.

### Slide 4: Why Risa Wins

- Risa already has the EMR data, PA records, CoverMyMeds pathway, payer-question workflow, QA process, and write-back loop.
- Auth Guardian requires zero new system integration.
- The wedge is execution, not detection.
- The product is additive: proactive renewal and continuity work sits on top of initial PA automation.
- MVP path is clear: auth-expiry first, coverage-expiry second, regimen-change checks third.
- Regulatory pressure is making PA faster and more digital, but practices still need a system that keeps therapy from falling through the cracks.

## 6. Sources

1. American Medical Association, "Fixing prior auth: Nearly 40 prior authorizations a week is way too many" — https://www.ama-assn.org/practice-management/prior-authorization/fixing-prior-auth-nearly-40-prior-authorizations-week-way
2. American Medical Association, "Prior Authorization Reform Progress Update" — https://www.ama-assn.org/system/files/prior-authorization-reform-progress-update.pdf
3. ASTRO, "Prior Authorization Survey 2024 Executive Summary" — https://www.astro.org/getmedia/8d6c0ff0-cd7e-4f94-b77e-a8ef81b234e0/PriorAuthSurvey_2024ExecutiveSummary.pdf
4. AJMC, "Prior Authorization Delays Cause Serious Harm to Patients With Cancer" — https://www.ajmc.com/view/prior-authorization-delays-cause-serious-harm-to-patients-with-cancer
5. The ASCO Post, "Prior Authorization Delays May Lead to Severe Consequences for Patients With Cancer" — https://ascopost.com/news/december-2024/prior-authorization-delays-may-lead-to-severe-consequences-for-patients-with-cancer/
6. PubMed, "Association of Prior Authorization and Price With Access to Oral Anticancer Drugs" — https://pubmed.ncbi.nlm.nih.gov/38086013/
7. Go-Flow, "Prior Authorization Denial Reasons: 2026 Data + Fixes" — https://go-flow.ai/resources/blogs/prior-authorization-denial-reasons-2026-data-fixes
8. The SORSO, "Why Are Claims Denied?" — https://www.thesorso.com/answers/why-are-claims-denied
9. Nirmitee, "Healthcare Denial Root Cause Analysis: Decision Tree + AI Pattern" — https://nirmitee.io/blog/healthcare-denial-root-cause-analysis-decision-tree-ai-pattern/
10. Klivira, "Oncology Infusion Prior Authorization Playbook: Regimen to Re-Auth" — https://klivira.com/blog/oncology-infusion-prior-authorization-playbook-regimen-to-re-auth
11. PharmaDossier, "Renewal Denial: Stable Disease, Continued Therapy" — https://pharmadossier.com/blog/renewal-denial-stable-disease-continued-therapy
12. Centers for Medicare & Medicaid Services, "CMS Interoperability and Prior Authorization Final Rule CMS-0057-F" — https://www.cms.gov/priorities/key-initiatives/burden-reduction/administrative-simplification/prior-authorization
13. Texas Department of Insurance, "Gold Carding Prior Authorization Exemptions" — https://www.tdi.texas.gov/hprovider/goldcard.html
14. American Medical Association, "Gold Card Act" — https://www.ama-assn.org/practice-management/prior-authorization
