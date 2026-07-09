# Failure Map Report — First Restoration Job Onboarding

**Sprint:** Phase 1 — Onboarding Telemetry Baseline & Failure Map (Issue #112)
**Prepared for:** Phase 2 — Guided First-Job Onboarding System (Issue #111)
**Status:** ☐ Draft &nbsp;|&nbsp; ☐ Complete — ready for Phase 2

---

## Section 1 — Cohort Summary

| Field                          | Value                         |
|--------------------------------|-------------------------------|
| Total sessions conducted       | <!-- integer -->              |
| Sessions meeting minimum (≥5)  | <!-- yes / no / partial -->   |
| Sessions with recording        | <!-- integer -->              |
| Async reviews completed        | <!-- integer -->              |
| Data collection period         | <!-- YYYY-MM-DD to YYYY-MM-DD --> |

### Cohort Size Confidence Statement

> **Required field — must be populated before Phase 2 begins.**

<!-- 
  Exactly ONE of the following applies. Delete the inapplicable options and fill in the blank:

  OPTION A — Minimum met (≥5 sessions):
  "Minimum cohort of 5 sessions met ([N] sessions completed). Findings below are directional 
  and not statistically significant; they provide sufficient signal to target Phase 2 design 
  decisions. Confidence level: MODERATE (directional signal; not statistically significant)."

  OPTION B — Preferred range met (8–10 sessions):
  "Preferred cohort of 8–10 sessions met ([N] sessions completed). Findings below provide 
  high-confidence directional signal. Confidence level: HIGH (directional; recommend confirming 
  with Phase 2 instrumented metrics)."

  OPTION C — Sub-minimum cohort (fewer than 5 sessions):
  "COHORT SHORTFALL: Only [N] of the required minimum 5 sessions were completed within the 
  sprint window. Findings below are preliminary and should NOT be used as definitive Phase 2 
  targeting without additional sessions. Confidence level: LOW (insufficient sample; findings 
  are directional hypotheses only). Recommended action: conduct [5-N] additional sessions 
  before Phase 2 scope is locked."
-->

---

## Section 2 — Baseline Completion Rate (AC #1 & AC #5)

| Metric                                | Value              |
|---------------------------------------|--------------------|
| Sessions completed (first job done)   | <!-- integer -->   |
| Sessions abandoned                    | <!-- integer -->   |
| Tutorial completion rate              | <!-- X% -->        |
| Hypothesis baseline (~35%)            | <!-- confirmed / revised / not measurable --> |

### Baseline Confirmation Statement

> **Required field — explicitly state one of the three outcomes below.**

<!-- 
  CONFIRMED: "The ~35% baseline completion rate is CONFIRMED. [N]% of [total] participants 
  completed the first restoration job. Phase 2 target of ≥60% is calibrated to this baseline."

  REVISED: "The ~35% baseline completion rate is REVISED. Actual measured rate is [N]%. 
  Phase 2 target should be recalibrated from [N]% to ≥60% (or as agreed with the team)."

  NOT YET MEASURABLE: "The ~35% baseline completion rate is NOT YET MEASURABLE due to 
  cohort shortfall ([N] sessions vs. minimum 5). The [N]% figure from this partial cohort 
  is preliminary; Phase 2 target calibration should be deferred until additional sessions 
  are completed."
-->

---

## Section 3 — Failure Point Heat Map (AC #2)

> Rank the top 3–5 steps by abandonment + confusion frequency (descending). Include **all** steps with at least 2 events across the cohort. If no high-drop-off points were found, see Section 3a.

| Rank | Step ID | Step Name                    | # Abandon | # Confusion | # TOOLTIP_SEEN_IGNORED | Total Events | Drop-off Rate |
|------|---------|------------------------------|-----------|-------------|------------------------|--------------|---------------|
| 1    |         |                              |           |             |                        |              |               |
| 2    |         |                              |           |             |                        |              |               |
| 3    |         |                              |           |             |                        |              |               |
| 4    |         |                              |           |             |                        |              |               |
| 5    |         |                              |           |             |                        |              |               |

### Section 3a — No Critical Failure Points Found (if applicable)

> Complete this section **instead of** the heat map table if no step shows a pattern of abandonment or confusion across the cohort.

<!-- 
  "NO CRITICAL FAILURE POINTS FOUND. All [N] participants completed the first restoration 
  job. No single step produced more than 1 abandonment or confusion event across the cohort. 
  This is a valid and informative finding: the current onboarding path does not present a 
  systematic barrier for this cohort. Recommended Phase 2 action: confirm with a larger 
  cohort or focus Phase 2 on time-to-completion optimisation rather than drop-off recovery."
-->

---

## Section 4 — Step-Level Timing Data (AC #3)

For each step appearing in the heat map (or all steps if no heat map), record timing:

| Step ID | Step Name           | Avg. Elapsed (seconds) | Min | Max | # Events | Likely Root Cause Pattern     |
|---------|---------------------|------------------------|-----|-----|-----------|-------------------------------|
|         |                     |                        |     |     |           |                               |

> **Root cause classification codes:** `navigational_confusion` / `skill_gap` / `ux_friction` / `unclear`

---

## Section 5 — Narrative Failure Map (AC #2 & AC #4)

> For each step in the heat map, provide a written narrative. Minimum: one paragraph per high-drop-off step.

### [Step ID] — [Step Name] (Rank #[N])

**Drop-off rate:** X%  
**Average elapsed before abandonment:** N seconds  
**Observable behaviour:** <!-- What did participants visibly do or say? -->  
**Likely root cause:** <!-- navigational_confusion / skill_gap / ux_friction -->  
**Supporting evidence:** <!-- Quotes, annotation notes, recording timestamps -->  
**Tooltip interaction:** <!-- Was the tooltip seen? Interacted with? Ignored? -->

---

## Section 6 — Tooltip Effectiveness Summary

| Step ID | Step Name | Tooltip Shown (#) | Tooltip Interacted (#) | Seen-But-Ignored (#) | Notes |
|---------|-----------|-------------------|------------------------|----------------------|-------|
|         |           |                   |                        |                      |       |

> This section directly addresses whether current tooltips are being seen-but-ignored vs. not noticed — informing Phase 2 tooltip redesign scope.

---

## Section 7 — Phase 2 Targeting Recommendation (AC #4 & AC #5)

> Required before Phase 2 design begins.

Based on the findings above:

**Is Phase 2 scope (#111 — Guided First-Job Onboarding System) correctly targeted?**

<!-- ONE of:
  CONFIRMED: "YES — Phase 2 scope is correctly targeted. The failure map confirms [Step X] 
  and [Step Y] as the primary drop-off points. Phase 2 callout card and guidance design 
  should prioritise these steps."

  REVISED: "PARTIALLY — Phase 2 scope requires revision. The original hypothesis assumed 
  [tool-selection] was the primary drop-off, but the failure map shows [Step X] as the 
  dominant failure point. Recommend Phase 2 design team reviews this finding before 
  finalising callout card placement."

  BLOCKED: "BLOCKED — Cohort shortfall prevents confident targeting. Recommend extending 
  Phase 1 data collection before locking Phase 2 scope."
-->

---

## Section 8 — Raw Data Reference

| File / Link                             | Description                             |
|-----------------------------------------|-----------------------------------------|
| `session-P01-YYYY-MM-DD.md`             | Annotated session for Participant 01    |
| `session-P02-YYYY-MM-DD.md`             | Annotated session for Participant 02    |
| `session-P03-YYYY-MM-DD.md`             | Annotated session for Participant 03    |
| `session-P04-YYYY-MM-DD.md`             | Annotated session for Participant 04    |
| `session-P05-YYYY-MM-DD.md`             | Annotated session for Participant 05    |

---

*This report must be posted (as a GitHub issue comment on #112 or as a linked doc) before Phase 2 (#111) design work begins. The Phase 2 feature is blocked on delivery of this report.*
