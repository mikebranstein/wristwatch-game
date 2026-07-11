/**
 * JobCardAnnotationWriter — serialises intake checklist findings onto the job record.
 *
 * Issue #144 — Watch Intake Appraisal: MVP Guided Visual Inspection Checklist.
 *
 * Responsibilities:
 *   - Converts the reviewed checklist item states into a structured key-value
 *     annotation list on the job record (AC4).
 *   - Persists annotations for the full job lifecycle — not reset on page/job reload.
 *   - Uses an injected job store so the annotation persistence layer can be swapped
 *     without changing this component (localStorage, IndexedDB, server, etc.).
 *
 * Annotation format per item:
 *   key   — human-readable label from the checklist item (e.g., 'Crystal Integrity')
 *   value — condition note derived from the item state:
 *             'reviewed-normal'      → 'Normal — no issues noted'
 *             'reviewed-issue-noted' → 'Issue noted'
 *             'not-reviewed'         → omitted (should not appear in completed checklist)
 *
 * Acceptance Criteria covered:
 *   AC4 — Job card (work order) annotated with findings from checklist.
 *   AC9 — Annotations persisted for full job lifecycle (survive reload).
 */

'use strict';

/** Annotation value strings for each item state. */
const ANNOTATION_VALUES = {
  'reviewed-normal':      'Normal — no issues noted',
  'reviewed-issue-noted': 'Issue noted',
};

class JobCardAnnotationWriter {
  /**
   * @param {Object} jobStore
   *   Injected job store with an `annotate(jobId, annotations)` method.
   *   The store is responsible for persisting annotations for the full job lifecycle (AC9).
   *   In production: backed by the work-order persistence layer.
   *   In tests: a plain in-memory mock is sufficient.
   */
  constructor(jobStore) {
    this._jobStore = jobStore;
  }

  /**
   * Write intake checklist findings to the job card.
   * Only items in a reviewed state generate annotations — 'not-reviewed' items are skipped.
   *
   * @param {string} jobId
   * @param {Array<{id: string, label: string, tooltip: string, state: string}>} itemsWithState
   *   Checklist items including their current review state (from IntakeInspectionChecklist).
   * @returns {Array<{key: string, value: string}>}
   *   The annotation list written to the job card (one entry per reviewed item).
   */
  writeAnnotations(jobId, itemsWithState) {
    const annotations = [];
    for (const item of itemsWithState) {
      const value = ANNOTATION_VALUES[item.state];
      if (!value) continue; // skip 'not-reviewed' items
      annotations.push({ key: item.label, value });
    }
    this._jobStore.annotate(jobId, annotations);
    return annotations;
  }

  /**
   * Returns the persisted annotations for a job.
   * Delegates to the injected job store's lookup.
   *
   * @param {string} jobId
   * @returns {Array<{key: string, value: string}>|null}
   *   Annotation list or null if the job has no annotations yet.
   */
  getAnnotations(jobId) {
    return this._jobStore.getAnnotations(jobId) || null;
  }
}

module.exports = { JobCardAnnotationWriter, ANNOTATION_VALUES };
