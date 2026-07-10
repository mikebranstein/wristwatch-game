# Onboarding Telemetry — Failure Map Report

**Sprint:** Onboarding Telemetry Baseline & Failure Map (Issue #112)
**Phase:** Phase 1 — Baseline Measurement
**Status:** Template / Scaffolded — populate during playtest sprint week
**Blocks:** Issue #111 (Guided First-Job Onboarding System — Phase 2)

---

## Executive Summary

> **This section to be completed after playtest sessions are annotated.**
>
> Example format:
> *"X of Y playtest participants (Z%) completed the first restoration job end-to-end.
> The top drop-off point was [step name], where N participants abandoned.
> Phase 2 scope targeting [step name] is [confirmed / needs revision]."*

---

## 1. Cohort Summary

| Metric                             | Value                       |
|------------------------------------|-----------------------------|
| **Sessions completed**             | _(record after sprint)_     |
| **Sessions abandoned**             | _(record after sprint)_     |
| **Total sessions annotated**       | _(record after sprint)_     |
| **Tutorial completion rate**       | **_%** _(target: ≥5 sessions for meaningful baseline)_ |
| **Cohort size vs. minimum (5)**    | _(sufficient / insufficient)_ |
| **Cohort size vs. preferred (8–10)**| _(reached / short by N)_   |

### AC5 — Baseline Confirmation

*(Complete this block after aggregating all sessions.)*

- [ ] **Confirmed:** Baseline ~35% completion rate is supported by cohort data
- [ ] **Revised downward:** Actual rate is below 35% — problem is more severe than hypothesised
- [ ] **Revised upward:** Actual rate is above 35% — Phase 2 effort may be smaller than planned
- [ ] **Not yet measurable:** Cohort size is below minimum (N < 5); findings are directional only

**Confidence statement:** *(Write 1–2 sentences here summarising confidence level and Phase 2 calibration recommendation.)*

---

## 2. Failure Point Heat Map

Ranked by drop-off frequency (abandonments weighted 2× over confusion events). Top 3–5 decision points only.

| Rank | Step Name                  | Abandonment Count | Confusion-with-Recovery | Avg Time Before Event (s) | Likely Root Cause            | Tooltip Ignored Count |
|------|----------------------------|--------------------|-------------------------|---------------------------|------------------------------|-----------------------|
| 1    | *(highest drop-off step)*  |                    |                         |                           | *(navigational_confusion / skill_gap / ux_friction / tooltip_failure)* | |
| 2    | *(second highest)*         |                    |                         |                           |                              |                       |
| 3    | *(third highest)*          |                    |                         |                           |                              |                       |
| 4    | *(fourth, if applicable)*  |                    |                         |                           |                              |                       |
| 5    | *(fifth, if applicable)*   |                    |                         |                           |                              |                       |

> **No failure points found:** If all participants complete the first job without abandonment or notable confusion, record: "No critical failure points identified in the current cohort. All N participants completed the first restoration job end-to-end." This is a valid and useful result — it may indicate the cohort is unrepresentative or that Phase 2 scope should be reconsidered.

---

## 3. Decision Point Deep Dives

Complete one sub-section per ranked failure point.

### 3.1 — [Step Name] *(Rank 1)*

**Observable Player Behavior:**
> *(Quotes or paraphrased observations from annotations. Example: "3 of 5 participants verbalised 'I don't know which tool' before abandoning.")*

**Timing:**
> Average time before abandonment/confusion: __ s
> *(Interpretation: <30 s → UX friction/navigational confusion; >30 s → likely skill gap or deeper mental model issue)*

**Tooltip Engagement:**
> *(Were tooltips present? Did participants read them, ignore them, or not notice them?)*

**Likely Root Cause:**
> *(One of: navigational_confusion / skill_gap / ux_friction / tooltip_failure — and explanation)*

**Phase 2 Implication:**
> *(What should Phase 2 address at this step? Example: "Guided callout at tool-selection with a recommended-tool highlight.")*

---

### 3.2 — [Step Name] *(Rank 2)*

*(Duplicate structure from 3.1)*

---

### 3.3 — [Step Name] *(Rank 3)*

*(Duplicate structure from 3.1)*

---

## 4. Tooltip Effectiveness Summary

| Step Name | Tooltip Shown? | Times Read | Times Dismissed Immediately | Times Not Noticed | Recommendation |
|-----------|---------------|------------|-----------------------------|--------------------|----------------|
|           |               |            |                             |                    |                |
|           |               |            |                             |                    |                |

> **Insight target:** Steps where tooltips exist but are consistently ignored or missed are strong Phase 2 candidates for redesigned hint delivery.

---

## 5. Raw Cohort Data Reference

*(Link to annotation rubric entries or paste summarised session outcomes.)*

| Session ID | Participant | Complete? | Abandonment Step | Async Review? | Notable Annotations |
|------------|-------------|-----------|------------------|---------------|---------------------|
|            |             |           |                  |               |                     |
|            |             |           |                  |               |                     |
|            |             |           |                  |               |                     |
|            |             |           |                  |               |                     |
|            |             |           |                  |               |                     |

---

## 6. Phase 2 Scope Validation

*(Complete after populating sections 2–4.)*

- **Phase 2 feature (Issue #111):** Guided First-Job Onboarding System
- **Phase 2 hypothesis:** Targeted callout cards at the top 2–3 failure points will raise tutorial completion from ~35% to ≥60%.

| Question | Answer |
|----------|--------|
| Does the failure map confirm the top failure points are in the first restoration job? | *(Yes / No / Partially)* |
| Is the ~35% completion rate baseline confirmed, or does Phase 2 need recalibration? | *(Confirmed / Revised to __%)*  |
| Are the identified failure points addressable by callout cards (vs. requiring deeper redesign)? | *(Yes / No — explain)* |
| Is there evidence tooltips are being seen-but-ignored (tooltip_failure root cause)? | *(Yes — at N steps / No)* |
| Is Phase 2 scope correctly targeted based on this data? | *(Yes / Needs revision — explain)* |

---

## 7. Risks and Caveats

- **Cohort size:** 5–10 participants provides a directional signal, not statistical significance. Findings should be treated as hypothesis-generators for Phase 2, not as definitive proof.
- **Annotation bias:** Annotators were *(blinded / not fully blinded)* to the Phase 2 design hypothesis. *(Note any potential bias.)*
- **Async review:** _(N of N)_ sessions were annotated from recording rather than live, which may miss real-time behavioral cues not captured on video.
- **Cohort representativeness:** Participants were recruited from *(source)*. This may not reflect the full range of target players.

---

*Report version: 1.0 — Issue #112 | Template ready for playtest data population*
