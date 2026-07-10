# Onboarding Telemetry — Annotation Rubric

**Sprint:** Phase 1 — Onboarding Telemetry Baseline & Failure Map (Issue #112)
**Scope:** First restoration job only. No game code changes.
**Prerequisite for:** Phase 2 Guided First-Job Onboarding System (Issue #111)

---

## Purpose

This rubric defines the structured observation framework used to annotate playtest sessions during the first restoration job. It ensures consistent event classification across all observers, minimises annotation bias, and produces machine-readable data that can be aggregated into a ranked failure-map report.

> **Observer note:** Annotators must NOT be briefed on the Phase 2 design hypothesis before conducting sessions. Awareness of the proposed solution could skew abandonment classification.

---

## Decision Points Under Observation

Record an event entry for **each** of the following checkpoints when a participant reaches it or fails to reach it:

| Step ID | Step Name                        | Description                                               |
|---------|----------------------------------|-----------------------------------------------------------|
| S01     | Job Acceptance                   | Participant opens and accepts the first restoration job   |
| S02     | Tool Selection                   | Participant selects the correct initial tool              |
| S03     | Component Identification         | Participant identifies the first component to interact with |
| S04     | Initial Disassembly              | Participant performs first disassembly action             |
| S05     | Mid-Disassembly Continuation     | Participant continues through the disassembly sequence    |
| S06     | Inspection / Diagnosis           | Participant inspects and diagnoses the faulty component   |
| S07     | Part Sourcing / Selection        | Participant selects a replacement part                    |
| S08     | Reassembly                       | Participant reassembles the watch correctly               |
| S09     | Job Completion                   | Participant completes and submits the restoration job     |

---

## Event Taxonomy

Each annotation entry must classify the event using **exactly one** of the following event types:

| Event Type Code | Label                        | Definition                                                                                           |
|-----------------|------------------------------|------------------------------------------------------------------------------------------------------|
| `COMPLETE`      | Step Completed               | Participant successfully completed this step without any hesitation event or external intervention   |
| `ABANDON`       | Session Abandoned            | Participant stopped the session at this step and did not continue (hard abandonment)                 |
| `CONFUSION`     | Confusion With Recovery      | Participant paused >10 seconds, verbalised uncertainty, or asked for help — but then continued       |
| `TOOLTIP_SEEN_IGNORED` | Tooltip Seen But Ignored | Tooltip was displayed at this step; participant did not read or interact with it                 |
| `INTERVENTION`  | Observer Intervention        | Observer or facilitator provided guidance to unblock participant (record detail in notes)            |

> **Critical distinction:** `ABANDON` means the participant left the session. `CONFUSION` means they struggled but recovered. These must never be conflated in annotation.

---

## Per-Step Annotation Fields

For every decision point encountered during a session, record **all** of the following fields:

| Field              | Type            | Required | Description                                                                 |
|--------------------|-----------------|----------|-----------------------------------------------------------------------------|
| `session_id`       | string          | ✅        | Unique session identifier (e.g., `P01-2026-07-15`)                         |
| `step_id`          | string          | ✅        | Step identifier from the Decision Points table (e.g., `S02`)               |
| `step_name`        | string          | ✅        | Human-readable step name (e.g., `Tool Selection`)                          |
| `event_type`       | enum            | ✅        | One of the five Event Taxonomy codes above                                  |
| `elapsed_seconds`  | integer         | ✅        | Wall-clock seconds from step entry to event trigger (abandonment, confusion onset, or completion) |
| `tooltip_displayed`| boolean         | ✅        | Was a tooltip shown at this step? (`true` / `false`)                       |
| `tooltip_interacted`| boolean        | ✅        | Did the participant read or interact with the tooltip? (`true` / `false` / `n/a` if none shown) |
| `verbalization`    | string          | optional | Exact or paraphrased quote from participant (e.g., `"I don't know which tool"`) |
| `qualitative_notes`| string          | ✅        | Observer narrative: what the participant did, what was confusing or smooth  |
| `root_cause_hypothesis` | enum       | optional | Annotator's initial hypothesis: `navigational_confusion` / `skill_gap` / `ux_friction` / `unclear` |
| `reviewed_async`   | boolean         | ✅        | Was this entry updated via post-session recording review? (`true` / `false`) |
| `recording_timestamp` | string       | optional | Timestamp in recording where this event occurs (e.g., `00:04:32`)          |

---

## Async Review Protocol

Annotations may be recorded **live** during the session or **post-session** via recording review. Both are valid.

1. Live annotations: complete all required fields in real time; leave `reviewed_async: false`.
2. Post-session review: re-watch recording, update or add annotation entries, set `reviewed_async: true` and populate `recording_timestamp`.
3. If live and async annotations conflict, **the async recording review takes precedence** (more accurate elapsed times).

---

## Root Cause Hypothesis Guide

Use this guide to assign a consistent `root_cause_hypothesis` value:

| Code                      | Use when…                                                                 |
|---------------------------|---------------------------------------------------------------------------|
| `navigational_confusion`  | Participant could not find or recognise the UI affordance for the action  |
| `skill_gap`               | Participant understood the UI but lacked domain knowledge (e.g., tool name) |
| `ux_friction`             | Participant understood intent but found the interaction tedious or error-prone |
| `unclear`                 | Evidence is insufficient to classify; document in `qualitative_notes`    |

---

## Structured Annotation Entry (JSON format)

Each step event should be recorded in a session tracking document using this structure:

```json
{
  "session_id": "P01-2026-07-15",
  "step_id": "S02",
  "step_name": "Tool Selection",
  "event_type": "CONFUSION",
  "elapsed_seconds": 34,
  "tooltip_displayed": true,
  "tooltip_interacted": false,
  "verbalization": "I don't know which tool to pick",
  "qualitative_notes": "Participant scanned the toolbar twice before hovering over each tool. Did not read tooltip. Eventually selected the correct tool after ~34 seconds.",
  "root_cause_hypothesis": "navigational_confusion",
  "reviewed_async": false,
  "recording_timestamp": null
}
```

---

## Session-Level Summary Fields

At the end of each session, record these session-level fields:

| Field                    | Type    | Required | Description                                                  |
|--------------------------|---------|----------|--------------------------------------------------------------|
| `session_id`             | string  | ✅        | Unique session identifier                                    |
| `participant_id`         | string  | ✅        | Anonymised participant code (e.g., `P01`)                    |
| `session_date`           | string  | ✅        | ISO date (e.g., `2026-07-15`)                               |
| `session_completed`      | boolean | ✅        | Did the participant complete the full first restoration job? |
| `abandonment_step_id`    | string  | optional | If abandoned: which step? (null if completed)                |
| `total_session_seconds`  | integer | ✅        | Total wall-clock duration of the session                     |
| `observer_id`            | string  | ✅        | Anonymised observer code (for bias tracking)                 |
| `recording_available`    | boolean | ✅        | Is a session recording available for async review?           |
| `async_review_completed` | boolean | ✅        | Has the async recording review been completed?               |
| `general_notes`          | string  | optional | Free-text overall session observations                       |

---

## Annotation Quality Checklist

Before marking a session as final, verify:

- [ ] All nine decision points accounted for (completed, abandoned, or marked as not reached)
- [ ] Every `ABANDON` event has an `elapsed_seconds` value
- [ ] Every `CONFUSION` event has at least a `qualitative_notes` entry
- [ ] Every `TOOLTIP_SEEN_IGNORED` event has `tooltip_displayed: true` and `tooltip_interacted: false`
- [ ] `session_completed` is consistent with the last step's `event_type`
- [ ] If `recording_available: true`, async review is either completed or scheduled
- [ ] `root_cause_hypothesis` populated for all `ABANDON` and `CONFUSION` events

---

*This rubric is a living document for this sprint only. Revisions require sign-off from the sprint lead and must not alter event taxonomy codes after the first session is recorded.*
