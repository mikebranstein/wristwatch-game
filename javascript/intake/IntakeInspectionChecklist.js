/**
 * IntakeInspectionChecklist — guided visual inspection checklist gate for first-job.
 *
 * Issue #144 — Watch Intake Appraisal: MVP Guided Visual Inspection Checklist.
 *
 * Responsibilities (per approved design):
 *   1. Manages 5–7 inspection checklist items, each with three states:
 *      'not-reviewed' | 'reviewed-normal' | 'reviewed-issue-noted'
 *   2. Acts as the disassembly gate — disassembly tools remain locked until
 *      ALL items are in a reviewed state (reviewed-normal or reviewed-issue-noted).
 *   3. Each item carries an educational tooltip explaining why watchmakers inspect
 *      that element (tutorial value — AC5).
 *   4. Gate is enforced only for first-job (first-job-completed flag in PlayerSaveState).
 *   5. Delegates annotation serialisation to JobCardAnnotationWriter.
 *
 * Design constraints:
 *   - Gate check is computed from persisted state, never in-memory only, to
 *     prevent soft-lock on job-reload (AC9 / design risk mitigation).
 *   - First-job detection flag defaults to false on new player profiles (never
 *     skip checklist by accident — design risk mitigation).
 *   - Second-job and beyond: gate is bypassed (MVP scope — AC6 / non-goal).
 *
 * Acceptance Criteria covered:
 *   AC1 — Checklist presented before disassembly tools on first job.
 *   AC2 — Disassembly unlocks when all items are reviewed.
 *   AC3 — Disassembly tools remain locked; tooltip fires when bypassed.
 *   AC4 — Checklist findings annotate the job card.
 *   AC5 — Each item has a distinct educational tooltip.
 *   AC6 — Checklist gate skipped on subsequent jobs (first-job-completed flag).
 */

'use strict';

/**
 * The canonical 7-point visual inspection checklist items.
 * Each item has:
 *   id          — stable identifier (used as annotation key)
 *   label       — display label shown in the checklist UI
 *   tooltip     — educational tooltip: why watchmakers inspect this element
 *
 * The items map directly to the acceptance-criteria checklist (case exterior,
 * crystal integrity, crown/stem, caseback, bracelet/strap, moisture/corrosion,
 * audible movement check).
 */
const INSPECTION_CHECKLIST_ITEMS = [
  {
    id: 'case_exterior',
    label: 'Case Exterior Condition',
    tooltip: 'Watchmakers examine the case exterior for deep scratches, dents, or unusual wear patterns that can indicate prior rough handling or a history of drops — relevant for both repair scope and client expectation management.',
  },
  {
    id: 'crystal_integrity',
    label: 'Crystal Integrity',
    tooltip: 'Checking the crystal first prevents accidental injury from sharp edges and reveals whether dial damage underneath requires immediate attention before any tools touch the movement.',
  },
  {
    id: 'crown_stem',
    label: 'Crown & Stem Function',
    tooltip: 'Turning the crown by hand before opening the case tests the winding and setting mechanisms non-destructively. Resistance, slippage, or looseness all indicate specific stem or keyless-works problems to document.',
  },
  {
    id: 'caseback',
    label: 'Caseback Condition',
    tooltip: 'Inspecting the caseback for thread wear, corrosion around the gasket seat, or previous amateur attempts to open it alerts the watchmaker to sealing challenges and potential water-ingress history.',
  },
  {
    id: 'bracelet_strap',
    label: 'Bracelet / Strap Condition',
    tooltip: 'The bracelet or strap records daily wear more visibly than the case. Checking it establishes condition at intake so pre-existing damage is not attributed to the service.',
  },
  {
    id: 'moisture_corrosion',
    label: 'Moisture & Corrosion Indicators',
    tooltip: 'Fogging on the inside of the crystal, blue-green verdigris around the crown tube, or rust-hued staining on the caseback are all red-flag moisture signatures — identifying these before opening protects the watchmaker and sets repair expectations early.',
  },
  {
    id: 'audible_movement',
    label: 'Audible Movement Check',
    tooltip: 'Holding the watch close and listening for ticking — or the absence of it — before any disassembly gives an immediate baseline on movement function. A stopped watch before you touched it is a very different job from one that stopped under your hands.',
  },
];

/** Valid states for a checklist item. */
const ITEM_STATES = Object.freeze({
  NOT_REVIEWED:         'not-reviewed',
  REVIEWED_NORMAL:      'reviewed-normal',
  REVIEWED_ISSUE_NOTED: 'reviewed-issue-noted',
});

/** Tooltip shown when a player tries to use disassembly tools before completing intake. */
const BYPASS_LOCK_TOOLTIP = 'Complete your intake inspection first.';

class IntakeInspectionChecklist {
  /**
   * @param {import('./JobCardAnnotationWriter').JobCardAnnotationWriter} annotationWriter
   *   Injected annotation writer — called on checklist completion to persist findings.
   * @param {import('../state/PlayerSaveState').PlayerSaveState} saveState
   *   Injected player save state — used to read/write first-job-completed flag and
   *   persist checklist item state for job-reload safety (AC9).
   * @param {Array<{id: string, label: string, tooltip: string}>} [items]
   *   Checklist item definitions — defaults to INSPECTION_CHECKLIST_ITEMS (7 items).
   *   Injected for testability.
   */
  constructor(annotationWriter, saveState, items = INSPECTION_CHECKLIST_ITEMS) {
    this._annotationWriter = annotationWriter;
    this._saveState = saveState;
    this._items = items;
    // Initialise in-memory item state from persisted state (job-reload safe — AC9)
    this._itemStates = this._loadPersistedItemStates();
    this._jobId = null;
    this._active = false;
  }

  // ─── Checklist Lifecycle ──────────────────────────────────────────────────────

  /**
   * Start the checklist for a given job.
   * Only activates on first-job — subsequent jobs bypass the gate entirely (AC6).
   * Restores any previously persisted item states (job-reload safety — AC9).
   *
   * @param {string} jobId
   * @returns {boolean} true if checklist is active (first job), false if bypassed
   */
  begin(jobId) {
    this._jobId = jobId;
    if (this._saveState.get('first_job_completed')) {
      // Subsequent jobs: bypass the checklist gate entirely (AC6 / MVP non-goal)
      this._active = false;
      return false;
    }
    this._active = true;
    // Reload persisted item states in case of mid-checklist job reload (AC9)
    this._itemStates = this._loadPersistedItemStates();
    return true;
  }

  /**
   * Mark a checklist item with the given state.
   * Persists the update immediately so a job-reload restores the correct state (AC9).
   *
   * @param {string} itemId — must match a valid item id
   * @param {'reviewed-normal'|'reviewed-issue-noted'} state — only reviewed states accepted here
   * @returns {boolean} true if update was applied, false if itemId is unknown or state is invalid
   */
  reviewItem(itemId, state) {
    const valid = [ITEM_STATES.REVIEWED_NORMAL, ITEM_STATES.REVIEWED_ISSUE_NOTED];
    if (!valid.includes(state)) return false;
    const item = this._items.find(i => i.id === itemId);
    if (!item) return false;
    this._itemStates[itemId] = state;
    this._persistItemStates();
    return true;
  }

  /**
   * Returns the current state of a checklist item.
   *
   * @param {string} itemId
   * @returns {'not-reviewed'|'reviewed-normal'|'reviewed-issue-noted'|null}
   *   null if itemId is unknown
   */
  getItemState(itemId) {
    const item = this._items.find(i => i.id === itemId);
    if (!item) return null;
    return this._itemStates[itemId] || ITEM_STATES.NOT_REVIEWED;
  }

  /**
   * Returns the checklist items with their current states and tooltip content.
   * Each entry shape: { id, label, tooltip, state }
   *
   * @returns {Array<{id: string, label: string, tooltip: string, state: string}>}
   */
  getItemsWithState() {
    return this._items.map(item => ({
      id:      item.id,
      label:   item.label,
      tooltip: item.tooltip,
      state:   this._itemStates[item.id] || ITEM_STATES.NOT_REVIEWED,
    }));
  }

  // ─── Gate Logic ───────────────────────────────────────────────────────────────

  /**
   * Returns true when the disassembly workflow may proceed.
   *
   * Gate logic:
   *   - If checklist is not active (subsequent jobs), gate is always open (AC6).
   *   - If checklist is active, ALL items must be in a reviewed state (AC2).
   *
   * @returns {boolean}
   */
  isDisassemblyUnlocked() {
    if (!this._active) return true; // bypass for subsequent jobs
    return this._allItemsReviewed();
  }

  /**
   * Called when a player attempts to interact with disassembly tools while the gate
   * is locked. Returns the bypass-lock tooltip text (AC3).
   *
   * @returns {string|null} tooltip text if gate is locked, null if gate is open
   */
  getBypassLockTooltip() {
    if (this.isDisassemblyUnlocked()) return null;
    return BYPASS_LOCK_TOOLTIP;
  }

  /**
   * Attempt to complete the checklist.
   * Only succeeds when all items are reviewed.
   * On success:
   *   - Writes job card annotations via JobCardAnnotationWriter (AC4).
   *   - Marks first-job-completed in PlayerSaveState so subsequent jobs bypass gate (AC6).
   *   - Returns the annotation list written to the job card.
   *
   * @returns {{ success: boolean, annotations: Array<{key: string, value: string}>|null }}
   */
  complete() {
    if (!this._active) {
      return { success: false, annotations: null };
    }
    if (!this._allItemsReviewed()) {
      return { success: false, annotations: null };
    }
    const annotations = this._annotationWriter.writeAnnotations(
      this._jobId,
      this.getItemsWithState(),
    );
    // Mark first-job as completed so subsequent jobs bypass the gate (AC6)
    this._saveState.set('first_job_completed', true);
    this._active = false;
    // Clear persisted checklist item state now that the job is complete
    this._saveState.set('intake_checklist_item_states', null);
    return { success: true, annotations };
  }

  // ─── Accessors ────────────────────────────────────────────────────────────────

  /**
   * Returns true if the checklist is currently active (first job, not yet completed).
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * Returns the total number of checklist items.
   * @returns {number}
   */
  getTotalItems() {
    return this._items.length;
  }

  /**
   * Returns the number of items already reviewed (any reviewed state).
   * @returns {number}
   */
  getReviewedCount() {
    return this._items.filter(
      item => this._itemStates[item.id] &&
              this._itemStates[item.id] !== ITEM_STATES.NOT_REVIEWED,
    ).length;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Returns true if every checklist item has been reviewed (any reviewed state).
   * @returns {boolean}
   */
  _allItemsReviewed() {
    return this._items.every(item => {
      const s = this._itemStates[item.id];
      return s === ITEM_STATES.REVIEWED_NORMAL || s === ITEM_STATES.REVIEWED_ISSUE_NOTED;
    });
  }

  /**
   * Loads persisted item states from PlayerSaveState (supports job-reload — AC9).
   * Returns a fresh map of id → 'not-reviewed' if nothing is persisted yet.
   * @returns {Object.<string, string>}
   */
  _loadPersistedItemStates() {
    const persisted = this._saveState.get('intake_checklist_item_states');
    if (persisted && typeof persisted === 'object') {
      return Object.assign({}, persisted);
    }
    const fresh = {};
    for (const item of this._items) {
      fresh[item.id] = ITEM_STATES.NOT_REVIEWED;
    }
    return fresh;
  }

  /**
   * Persists the current item states to PlayerSaveState (job-reload safety — AC9).
   */
  _persistItemStates() {
    this._saveState.set('intake_checklist_item_states', Object.assign({}, this._itemStates));
  }
}

module.exports = {
  IntakeInspectionChecklist,
  INSPECTION_CHECKLIST_ITEMS,
  ITEM_STATES,
  BYPASS_LOCK_TOOLTIP,
};
