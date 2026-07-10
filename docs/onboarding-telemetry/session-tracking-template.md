# Playtest Session Tracking Template

**Sprint:** Phase 1 — Onboarding Telemetry Baseline & Failure Map (Issue #112)
**Rubric reference:** `docs/onboarding-telemetry/annotation-rubric.md`

> Copy this template for **each** playtest session. File as `session-PXX-YYYY-MM-DD.md` in this directory.

---

## Session Header

| Field                   | Value                         |
|-------------------------|-------------------------------|
| session_id              | <!-- e.g. P01-2026-07-15 --> |
| participant_id          | <!-- e.g. P01 -->            |
| session_date            | <!-- YYYY-MM-DD -->           |
| observer_id             | <!-- e.g. OBS-A -->           |
| session_completed       | <!-- true / false -->         |
| abandonment_step_id     | <!-- step ID or null -->      |
| total_session_seconds   | <!-- integer -->              |
| recording_available     | <!-- true / false -->         |
| async_review_completed  | <!-- true / false -->         |
| general_notes           | <!-- free text -->            |

---

## Step-by-Step Annotations

Record one block per decision point reached. Copy additional blocks as needed.

### Step S01 — Job Acceptance

```json
{
  "session_id": "",
  "step_id": "S01",
  "step_name": "Job Acceptance",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S02 — Tool Selection

```json
{
  "session_id": "",
  "step_id": "S02",
  "step_name": "Tool Selection",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S03 — Component Identification

```json
{
  "session_id": "",
  "step_id": "S03",
  "step_name": "Component Identification",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S04 — Initial Disassembly

```json
{
  "session_id": "",
  "step_id": "S04",
  "step_name": "Initial Disassembly",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S05 — Mid-Disassembly Continuation

```json
{
  "session_id": "",
  "step_id": "S05",
  "step_name": "Mid-Disassembly Continuation",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S06 — Inspection / Diagnosis

```json
{
  "session_id": "",
  "step_id": "S06",
  "step_name": "Inspection / Diagnosis",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S07 — Part Sourcing / Selection

```json
{
  "session_id": "",
  "step_id": "S07",
  "step_name": "Part Sourcing / Selection",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S08 — Reassembly

```json
{
  "session_id": "",
  "step_id": "S08",
  "step_name": "Reassembly",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

### Step S09 — Job Completion

```json
{
  "session_id": "",
  "step_id": "S09",
  "step_name": "Job Completion",
  "event_type": "",
  "elapsed_seconds": 0,
  "tooltip_displayed": false,
  "tooltip_interacted": false,
  "verbalization": "",
  "qualitative_notes": "",
  "root_cause_hypothesis": "",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

---

## Post-Session Checklist

- [ ] All nine decision points accounted for
- [ ] `session_completed` matches final step outcome
- [ ] All `ABANDON` events have `elapsed_seconds`
- [ ] All `CONFUSION` events have `qualitative_notes`
- [ ] All `TOOLTIP_SEEN_IGNORED` events have `tooltip_displayed: true`, `tooltip_interacted: false`
- [ ] Recording reviewed async (if available): `async_review_completed: true`
- [ ] `root_cause_hypothesis` populated for `ABANDON` and `CONFUSION` events

---

## Async Recording Review Notes

*(Complete after post-session recording review. Set `reviewed_async: true` on updated entries.)*

| recording_timestamp | step_id | Update / correction |
|---------------------|---------|---------------------|
|                     |         |                     |

---
