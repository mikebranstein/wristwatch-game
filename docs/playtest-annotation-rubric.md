# Onboarding Telemetry Baseline — Playtest Annotation Rubric

> **Issue #112 — Phase 1 of the Guided First-Job Onboarding System**  
> This document is the observer's field guide for annotating first-job playtest sessions.  
> Deliver the completed failure-map report as a GitHub issue comment **before Phase 2 (#111) begins**.

---

## Purpose

This rubric ensures consistent, structured annotation across all playtest sessions so that the resulting failure-map report is comparable across participants. It defines the event taxonomy, step identifiers, and annotation procedure used by the `PlaytestAnnotationFramework` module (`src/telemetry/PlaytestAnnotationFramework.js`).

---

## Cohort Requirements

| Parameter | Value |
|---|---|
| Minimum sessions | **5** (required for meaningful pattern detection) |
| Preferred sessions | **8–10** |
| Scope | First restoration job only — no other jobs annotated |
| Observer blinding | Observer should not know the Phase 2 design hypothesis |

---

## Decision Points (Step IDs)

Use these exact identifiers when recording annotations. They match the `DECISION_POINTS` constants in `PlaytestAnnotationFramework.js`.

| Step ID | Description |
|---|---|
| `tool_selection` | Participant must choose the correct tool from the tool panel |
| `disassembly_start` | Participant begins removing the first watch components |
| `component_identification` | Participant must identify a specific component by name/type |
| `cleaning_step` | Participant performs the cleaning phase |
| `diagnosis_step` | Participant diagnoses the fault |
| `reassembly_step` | Participant reassembles the watch |
| `final_verification` | Participant completes the final quality check |

---

## Event Taxonomy

| Event Type | Code | When to record |
|---|---|---|
| Completion | `completion` | Participant finishes the first job start-to-finish |
| Abandonment | `abandonment` | Participant stops without finishing; marks end of session |
| Confusion | `confusion` | Participant pauses >10 seconds, asks for help, or verbalises confusion — **but then recovers and continues** |
| Tooltip Ignored | `tooltip_ignored` | A tooltip was visible on screen but the participant did not read or act on it |

> **Key distinction:** `confusion` is NOT `abandonment`. If the participant recovers and continues, mark it as `confusion`. Only mark `abandonment` when the session ends without completion.

---

## Annotation Fields (per event)

| Field | Type | Required | Notes |
|---|---|---|---|
| `stepName` | string | Yes | Use Step IDs from table above |
| `eventType` | string | Yes | Use Event Taxonomy codes |
| `elapsedSeconds` | number | Yes | Seconds elapsed in the session at this event |
| `qualitativeNotes` | string | Recommended | Verbatim or paraphrased participant verbalisations; body language; observed behaviour |
| `tooltipVisible` | boolean | Yes for `tooltip_ignored` | Was a tooltip on screen at the time? |
| `asyncReviewed` | boolean | Yes | `true` if annotation was added during recording review, `false` if live |

---

## Session Recording Procedure

### Before the session
1. Open a new `PlaytestSession` in the annotation tool, or fill in the paper template.
2. Record `sessionId` (e.g., `session-2026-07-10-001`) and `participantId` (opaque, no PII).
3. Note the session start time.

### During the session
4. Observe without intervening unless the participant explicitly asks for help.
5. At each decision point, note the elapsed time and any hesitation behaviour.
6. If a confusion threshold event occurs (pause >10s, verbal confusion), record a `confusion` event.
7. If a tooltip appears and the participant ignores it, record a `tooltip_ignored` event.
8. If the participant stops and will not continue, record an `abandonment` event.
9. If the participant reaches final verification and completes the job, record a `completion` event.

### After the session (async review)
10. Re-watch the session recording within 24 hours.
11. Add any annotations missed live — mark these with `asyncReviewed: true`.
12. Update qualitative notes with observations that are clearer on second viewing.

---

## Data Aggregation

Once all sessions are annotated, use `PlaytestCohort.generateReport()` to produce the failure-map report:

```js
const { PlaytestCohort } = require('./src/telemetry/PlaytestAnnotationFramework');

const cohort = new PlaytestCohort();
// ... add sessions ...

const report = cohort.generateReport();
console.log(JSON.stringify(report, null, 2));
```

The report includes:

- **Completion rate** — `completionRatePercent` (AC1)
- **Failure map** — `failurePoints` ranked by drop-off frequency (AC2)
- **Step-level timing** — `stepLevelTiming` with average elapsed seconds per drop-off point (AC3)
- **Phase 2 recommendation** — `phase2Recommendation` confirming or revising scope (AC4, AC5)
- **Baseline status** — `baselineStatus`: `confirmed` / `revised_higher` / `revised_lower` / `not_measurable` (AC5)
- **Cohort shortfall notice** — `cohortShortfall` if fewer than 5 sessions (graceful handling per Test Scenario 7)

---

## Graceful Handling of Edge Cases

| Scenario | Expected Report Output |
|---|---|
| < 5 sessions complete | `confidence: "low"`, `cohortShortfall` field populated, `baselineStatus: "not_measurable"` |
| All participants complete | `noCriticalFailurePoints: true`, `failurePoints` sentinel: "No critical failure points found" |
| Annotations added after recording | `asyncReviewed: true` on those events; no difference in aggregation |

---

## Non-Goals (Reminder)

- ❌ Do NOT change game UI, tooltips, or tutorial flow during observation sessions
- ❌ Do NOT conduct A/B testing or design variants
- ❌ Do NOT build an automated telemetry pipeline (manual annotation is sufficient for Phase 1)
- ❌ Do NOT analyse jobs beyond the first restoration job
- ❌ Do NOT collect D1/D7 retention metrics

---

## Dependency

This report **blocks Phase 2** (#111 — Guided First-Job Onboarding System).  
Deliver the report as a GitHub issue comment on #112 before Phase 2 design begins.

---

*Annotation rubric for Issue #112 | wristwatch-game | Phase 1 Onboarding Telemetry Baseline*
