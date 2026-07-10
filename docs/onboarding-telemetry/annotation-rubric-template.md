# Onboarding Telemetry — Playtest Annotation Rubric Template

**Sprint:** Onboarding Telemetry Baseline & Failure Map (Issue #112)
**Purpose:** Structured annotation form for recording first-restoration-job playtest sessions.
**Scope:** First restoration job only. No game code is modified during this sprint.

---

## How to Use This Rubric

1. **Before the session:** Fill in the Session Header fields.
2. **During the session (or from recording):** Add one Annotation Entry per decision-point event.
   - Record every pause >10 s, request for help, tooltip interaction, or abandonment.
   - If annotating from a recording (async review), mark `Annotation Source: Recording`.
3. **After the session:** Fill in the Session Outcome and mark the rubric complete.

> **Observer note:** Stay blind to the Phase 2 design hypothesis while annotating. Record what you observe, not what you expect to see. Annotation bias is a documented risk for this sprint.

---

## Session Header

| Field                | Value                               |
|----------------------|-------------------------------------|
| **Session ID**       | `session-YYYY-MM-DD-NNN`            |
| **Participant ID**   | `P-NNN` (anonymised)                |
| **Session Date**     | `YYYY-MM-DD`                        |
| **Annotation Source**| `Live` / `Recording`                |
| **Annotator ID**     | `A-NNN` (anonymised)                |
| **Session Start Time**| `HH:MM` (local time)              |

---

## Annotation Entries

Duplicate this table row for each event. Record in chronological order (ascending `Elapsed Time`).

| # | Step Name                    | Elapsed Time (s) | Event Type               | Notes (verbatim if possible)                            | Tooltip Interaction        |
|---|------------------------------|------------------|--------------------------|---------------------------------------------------------|----------------------------|
| 1 | *(see canonical steps below)*| *(seconds)*      | *(see event types below)*| *(participant verbalization, observable behavior)*      | *(see tooltip codes below)*|

### Canonical Step Names

Use the exact step name from this list where possible. Free-text is allowed for steps not listed.

| Step Name                | Description                                                        |
|--------------------------|--------------------------------------------------------------------|
| `job-selection`          | Player selects the first restoration job from the job board        |
| `tool-selection`         | Player chooses which tool(s) to use for the job                    |
| `case-back-removal`      | Player removes the watch case back to access the movement          |
| `movement-inspection`    | Player inspects the movement before disassembly begins             |
| `component-identification`| Player identifies components (mainspring, balance wheel, etc.)   |
| `disassembly-start`      | Player begins disassembling the movement (first component removed) |
| `disassembly-mid`        | Player is mid-disassembly (multiple components removed)            |
| `cleaning-start`         | Player begins the cleaning phase                                   |
| `reassembly-start`       | Player begins reassembling the movement                            |
| `reassembly-mid`         | Player is mid-reassembly                                           |
| `final-inspection`       | Player performs the final inspection before job completion         |
| `job-completion`         | Player completes the first restoration job end-to-end              |

### Event Types

| Code                       | When to Use                                                                                   |
|----------------------------|-----------------------------------------------------------------------------------------------|
| `completion`               | Participant reached this step and continued without notable hesitation or intervention        |
| `abandonment`              | Participant exited the session at this step; did **not** recover or continue                  |
| `confusion_with_recovery`  | Participant paused >10 s, verbalised confusion, or asked for help — but **continued** playing |
| `tooltip_ignored`          | A tooltip was displayed at this step but the participant did not engage with it               |

### Tooltip Interaction Codes

| Code                    | Meaning                                                        |
|-------------------------|----------------------------------------------------------------|
| `read`                  | Tooltip appeared; participant read and closed it normally      |
| `dismissed_immediately` | Tooltip appeared; participant dismissed it without reading     |
| `not_noticed`           | Tooltip appeared but participant appeared not to notice it     |
| `none`                  | No tooltip was displayed at this step                          |

---

## Session Outcome

| Field                      | Value                          |
|----------------------------|--------------------------------|
| **Session Complete?**      | `Yes` / `No`                   |
| **Abandonment Step**       | *(step name, or blank if N/A)* |
| **Total Session Duration** | *(seconds from start to end)*  |
| **Annotator Notes**        | *(overall session observations)*|

---

## Example — Completed Session (Scenario 1)

| # | Step Name        | Elapsed Time (s) | Event Type  | Notes                                    | Tooltip Interaction |
|---|------------------|------------------|-------------|------------------------------------------|---------------------|
| 1 | tool-selection   | 45               | completion  | Selected case opener without hesitation  | read                |
| 2 | disassembly-start| 180              | completion  | Began disassembly confidently            | none                |
| 3 | reassembly-mid   | 720              | confusion_with_recovery | Paused 20 s; muttered "where does this go?" then continued | none |
| 4 | job-completion   | 1140             | completion  | Finished job; appeared satisfied         | none                |

**Session Complete?** Yes | **Total Duration:** 1140 s

---

## Example — Abandoned Session at Tool Selection (Scenario 2)

| # | Step Name      | Elapsed Time (s) | Event Type   | Notes                                             | Tooltip Interaction  |
|---|----------------|------------------|--------------|---------------------------------------------------|----------------------|
| 1 | tool-selection | 88               | abandonment  | Said: "I don't know which tool to use." Closed tab.| not_noticed         |

**Session Complete?** No | **Abandonment Step:** tool-selection | **Total Duration:** 88 s

---

## Cohort Tracking

Track all sessions here to monitor cohort progress against the minimum of 5 required.

| Session ID      | Participant ID | Date       | Complete? | Abandonment Step (if any) | Async? |
|-----------------|----------------|------------|-----------|---------------------------|--------|
|                 |                |            |           |                           |        |
|                 |                |            |           |                           |        |
|                 |                |            |           |                           |        |
|                 |                |            |           |                           |        |
|                 |                |            |           |                           |        |

**Minimum required:** 5 sessions | **Preferred:** 8–10 sessions

---

*Template version: 1.0 — Issue #112*
