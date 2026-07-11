/**
 * Tests for IntakeInspectionChecklist.js — Issue #144
 *
 * Covers all 5 Acceptance Criteria and the 10 Test Scenarios from the feature request:
 *
 * AC1: Given a player starts their first service job, when the disassembly workflow
 *      is triggered, then the 5-7-point visual inspection checklist is presented
 *      before any disassembly tools become available.
 *
 * AC2: Given the checklist is displayed, when the player has reviewed and marked all
 *      checklist items, then the disassembly workflow unlocks and the player can proceed.
 *
 * AC3: Given a player attempts to skip or bypass the checklist, when they interact
 *      with disassembly tools, then those tools remain locked and a tooltip indicates
 *      "Complete your intake inspection first."
 *
 * AC4: Given the player completes the checklist, when the job card is displayed,
 *      then all checklist findings appear as annotations in the job card's condition section.
 *
 * AC5: Given a player is on any checklist item, when they hover/focus on the item,
 *      then a contextual tooltip explains why watchmakers inspect that specific element.
 *
 * Test Scenarios:
 *   1. Happy path — first job checklist completion
 *   2. Gate enforcement — tools locked until checklist complete
 *   3. Partial checklist — cannot proceed with subset reviewed
 *   4. Job card annotation persistence
 *   5. Tooltip educational content — distinct, relevant, non-blank
 *   6. Second job — checklist gate bypassed post-tutorial
 *   7. Checklist item states — all three states correctly reflected
 *   8. Accessibility / keyboard navigation (structural check — state coverage)
 *   9. Edge case — job reload mid-checklist restores state
 *   10. End-to-end flow integration
 */

'use strict';

const {
  IntakeInspectionChecklist,
  INSPECTION_CHECKLIST_ITEMS,
  ITEM_STATES,
  BYPASS_LOCK_TOOLTIP,
} = require('../../../src/intake/IntakeInspectionChecklist');
const { JobCardAnnotationWriter } = require('../../../src/intake/JobCardAnnotationWriter');
const { PlayerSaveState } = require('../../../src/state/PlayerSaveState');

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Minimal in-memory job store for testing JobCardAnnotationWriter. */
function makeJobStore() {
  const store = {};
  return {
    annotate(jobId, annotations) {
      store[jobId] = annotations;
    },
    getAnnotations(jobId) {
      return store[jobId] || null;
    },
    _store: store,
  };
}

/** Build a fresh IntakeInspectionChecklist with all dependencies. */
function makeChecklist(saveStateOverrides = {}, itemOverride = null) {
  const saveState = new PlayerSaveState(saveStateOverrides);
  const jobStore = makeJobStore();
  const annotationWriter = new JobCardAnnotationWriter(jobStore);
  const checklist = itemOverride
    ? new IntakeInspectionChecklist(annotationWriter, saveState, itemOverride)
    : new IntakeInspectionChecklist(annotationWriter, saveState);
  return { checklist, saveState, annotationWriter, jobStore };
}

/** Review every item in a checklist as 'reviewed-normal'. */
function reviewAllItems(checklist, state = ITEM_STATES.REVIEWED_NORMAL) {
  for (const item of INSPECTION_CHECKLIST_ITEMS) {
    checklist.reviewItem(item.id, state);
  }
}

// ─── AC1: Checklist is presented before disassembly on first job ──────────────

describe('AC1 — Checklist presented before disassembly on first job', () => {
  test('begin() returns true (checklist active) for a new player on first job', () => {
    const { checklist } = makeChecklist();
    const active = checklist.begin('job-001');
    expect(active).toBe(true);
    expect(checklist.isActive()).toBe(true);
  });

  test('checklist items are between 5 and 7 inclusive (feature scope)', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    expect(checklist.getTotalItems()).toBeGreaterThanOrEqual(5);
    expect(checklist.getTotalItems()).toBeLessThanOrEqual(7);
  });

  test('disassembly is locked when checklist is active and no items reviewed', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    expect(checklist.isDisassemblyUnlocked()).toBe(false);
  });

  test('INSPECTION_CHECKLIST_ITEMS has exactly 7 items matching the spec', () => {
    expect(INSPECTION_CHECKLIST_ITEMS).toHaveLength(7);
    const expectedIds = [
      'case_exterior',
      'crystal_integrity',
      'crown_stem',
      'caseback',
      'bracelet_strap',
      'moisture_corrosion',
      'audible_movement',
    ];
    const actualIds = INSPECTION_CHECKLIST_ITEMS.map(i => i.id);
    expect(actualIds).toEqual(expectedIds);
  });
});

// ─── AC2: Disassembly unlocks when all items reviewed ────────────────────────

describe('AC2 — Disassembly unlocks when all items are reviewed', () => {
  test('isDisassemblyUnlocked() is false until last item is reviewed', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    // Review all but the last item
    for (let i = 0; i < INSPECTION_CHECKLIST_ITEMS.length - 1; i++) {
      checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[i].id, ITEM_STATES.REVIEWED_NORMAL);
      expect(checklist.isDisassemblyUnlocked()).toBe(false);
    }
    // Review the last item
    const lastId = INSPECTION_CHECKLIST_ITEMS[INSPECTION_CHECKLIST_ITEMS.length - 1].id;
    checklist.reviewItem(lastId, ITEM_STATES.REVIEWED_NORMAL);
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
  });

  test('complete() succeeds and returns annotations once all items reviewed', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    const result = checklist.complete();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.annotations)).toBe(true);
    expect(result.annotations.length).toBe(INSPECTION_CHECKLIST_ITEMS.length);
  });

  test('"reviewed-issue-noted" items also count towards gate completion', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    // Mix of states
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    for (let i = 1; i < INSPECTION_CHECKLIST_ITEMS.length; i++) {
      checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[i].id, ITEM_STATES.REVIEWED_NORMAL);
    }
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
  });

  test('getReviewedCount() tracks progress correctly', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    expect(checklist.getReviewedCount()).toBe(0);
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    expect(checklist.getReviewedCount()).toBe(1);
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[1].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    expect(checklist.getReviewedCount()).toBe(2);
  });
});

// ─── AC3: Disassembly tools remain locked; bypass tooltip fired ───────────────

describe('AC3 — Gate enforcement and bypass tooltip', () => {
  test('getBypassLockTooltip() returns the correct message when gate is locked', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const tooltip = checklist.getBypassLockTooltip();
    expect(tooltip).toBe('Complete your intake inspection first.');
    expect(tooltip).toBe(BYPASS_LOCK_TOOLTIP);
  });

  test('getBypassLockTooltip() returns null once disassembly is unlocked', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
    expect(checklist.getBypassLockTooltip()).toBeNull();
  });

  test('partial review still locks disassembly and keeps tooltip active', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    // Review 4 of 7
    for (let i = 0; i < 4; i++) {
      checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[i].id, ITEM_STATES.REVIEWED_NORMAL);
    }
    expect(checklist.isDisassemblyUnlocked()).toBe(false);
    expect(checklist.getBypassLockTooltip()).toBe(BYPASS_LOCK_TOOLTIP);
  });

  test('complete() fails gracefully when not all items reviewed', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    const result = checklist.complete();
    expect(result.success).toBe(false);
    expect(result.annotations).toBeNull();
  });
});

// ─── AC4: Job card annotations ────────────────────────────────────────────────

describe('AC4 — Job card annotation on checklist completion', () => {
  test('annotations include one entry per checklist item', () => {
    const { checklist, jobStore } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    const stored = jobStore.getAnnotations('job-001');
    expect(stored).not.toBeNull();
    expect(stored).toHaveLength(INSPECTION_CHECKLIST_ITEMS.length);
  });

  test('annotation keys match checklist item labels', () => {
    const { checklist, jobStore } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    const stored = jobStore.getAnnotations('job-001');
    const expectedLabels = INSPECTION_CHECKLIST_ITEMS.map(i => i.label);
    const actualKeys = stored.map(a => a.key);
    expect(actualKeys).toEqual(expectedLabels);
  });

  test('reviewed-normal items annotate as "Normal — no issues noted"', () => {
    const { checklist, jobStore } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist, ITEM_STATES.REVIEWED_NORMAL);
    checklist.complete();
    const stored = jobStore.getAnnotations('job-001');
    expect(stored.every(a => a.value === 'Normal — no issues noted')).toBe(true);
  });

  test('reviewed-issue-noted items annotate as "Issue noted"', () => {
    const { checklist, jobStore } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    checklist.complete();
    const stored = jobStore.getAnnotations('job-001');
    expect(stored.every(a => a.value === 'Issue noted')).toBe(true);
  });

  test('mixed states produce correct annotation values per item', () => {
    const { checklist, jobStore } = makeChecklist();
    checklist.begin('job-001');
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    for (let i = 1; i < INSPECTION_CHECKLIST_ITEMS.length; i++) {
      checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[i].id, ITEM_STATES.REVIEWED_NORMAL);
    }
    checklist.complete();
    const stored = jobStore.getAnnotations('job-001');
    expect(stored[0].value).toBe('Issue noted');
    expect(stored[0].key).toBe(INSPECTION_CHECKLIST_ITEMS[0].label);
    for (let i = 1; i < stored.length; i++) {
      expect(stored[i].value).toBe('Normal — no issues noted');
    }
  });

  test('annotations persist on job card — navigating away and back returns same data (Scenario 4)', () => {
    const { checklist, annotationWriter, jobStore } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    // Simulate navigating away and back — annotations are still in job store
    const storedAfterNavigation = annotationWriter.getAnnotations('job-001');
    expect(storedAfterNavigation).not.toBeNull();
    expect(storedAfterNavigation).toHaveLength(INSPECTION_CHECKLIST_ITEMS.length);
    // Values haven't changed
    expect(storedAfterNavigation[0].key).toBe(INSPECTION_CHECKLIST_ITEMS[0].label);
  });
});

// ─── AC5: Educational tooltips ────────────────────────────────────────────────

describe('AC5 — Educational tooltips on every checklist item (Scenario 5)', () => {
  test('every checklist item has a non-empty tooltip', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const items = checklist.getItemsWithState();
    for (const item of items) {
      expect(typeof item.tooltip).toBe('string');
      expect(item.tooltip.trim().length).toBeGreaterThan(0);
    }
  });

  test('all tooltips are distinct (no duplicates)', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const items = checklist.getItemsWithState();
    const tooltips = items.map(i => i.tooltip);
    const uniqueTooltips = new Set(tooltips);
    expect(uniqueTooltips.size).toBe(tooltips.length);
  });

  test('INSPECTION_CHECKLIST_ITEMS raw data has tooltip on every item', () => {
    for (const item of INSPECTION_CHECKLIST_ITEMS) {
      expect(typeof item.tooltip).toBe('string');
      expect(item.tooltip.trim().length).toBeGreaterThan(0);
    }
  });

  test('tooltip content references the specific item inspected (watchmaker-relevant)', () => {
    const crystalItem = INSPECTION_CHECKLIST_ITEMS.find(i => i.id === 'crystal_integrity');
    expect(crystalItem.tooltip.toLowerCase()).toMatch(/crystal|dial|sharp/);

    const crownItem = INSPECTION_CHECKLIST_ITEMS.find(i => i.id === 'crown_stem');
    expect(crownItem.tooltip.toLowerCase()).toMatch(/crown|stem|winding|setting/);

    const moistureItem = INSPECTION_CHECKLIST_ITEMS.find(i => i.id === 'moisture_corrosion');
    expect(moistureItem.tooltip.toLowerCase()).toMatch(/moisture|water|verdigris|corrosion/);
  });
});

// ─── Scenario 6: Second job — gate bypassed ───────────────────────────────────

describe('Scenario 6 — Second job checklist gate bypassed (first-job-only, MVP)', () => {
  test('begin() returns false when first_job_completed is true', () => {
    const { checklist } = makeChecklist({ first_job_completed: true });
    const active = checklist.begin('job-002');
    expect(active).toBe(false);
    expect(checklist.isActive()).toBe(false);
  });

  test('isDisassemblyUnlocked() is true for subsequent jobs (no gate)', () => {
    const { checklist } = makeChecklist({ first_job_completed: true });
    checklist.begin('job-002');
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
  });

  test('getBypassLockTooltip() is null on subsequent jobs', () => {
    const { checklist } = makeChecklist({ first_job_completed: true });
    checklist.begin('job-002');
    expect(checklist.getBypassLockTooltip()).toBeNull();
  });

  test('first_job_completed defaults to false on new player (guard against bad default)', () => {
    const saveState = new PlayerSaveState();
    expect(saveState.get('first_job_completed')).toBe(false);
  });

  test('complete() sets first_job_completed to true in PlayerSaveState', () => {
    const { checklist, saveState } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    expect(saveState.get('first_job_completed')).toBe(true);
  });
});

// ─── Scenario 7: Checklist item states — all three states ────────────────────

describe('Scenario 7 — Item state transitions', () => {
  test('all items start in "not-reviewed" state', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const items = checklist.getItemsWithState();
    for (const item of items) {
      expect(item.state).toBe(ITEM_STATES.NOT_REVIEWED);
    }
  });

  test('reviewItem() transitions item to "reviewed-normal"', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    expect(checklist.getItemState(INSPECTION_CHECKLIST_ITEMS[0].id)).toBe(ITEM_STATES.REVIEWED_NORMAL);
  });

  test('reviewItem() transitions item to "reviewed-issue-noted"', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    expect(checklist.getItemState(INSPECTION_CHECKLIST_ITEMS[0].id)).toBe(ITEM_STATES.REVIEWED_ISSUE_NOTED);
  });

  test('reviewItem() rejects invalid state and returns false', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const result = checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, 'not-reviewed');
    expect(result).toBe(false);
    expect(checklist.getItemState(INSPECTION_CHECKLIST_ITEMS[0].id)).toBe(ITEM_STATES.NOT_REVIEWED);
  });

  test('reviewItem() rejects unknown item id and returns false', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const result = checklist.reviewItem('nonexistent_id', ITEM_STATES.REVIEWED_NORMAL);
    expect(result).toBe(false);
  });

  test('getItemState() returns null for unknown item id', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    expect(checklist.getItemState('nonexistent_id')).toBeNull();
  });

  test('ITEM_STATES constant exposes all three valid states', () => {
    expect(ITEM_STATES.NOT_REVIEWED).toBe('not-reviewed');
    expect(ITEM_STATES.REVIEWED_NORMAL).toBe('reviewed-normal');
    expect(ITEM_STATES.REVIEWED_ISSUE_NOTED).toBe('reviewed-issue-noted');
  });
});

// ─── Scenario 8: Accessibility — keyboard navigation structural coverage ──────

describe('Scenario 8 — Keyboard navigation / accessibility structural coverage', () => {
  test('all checklist items are reachable via getItemsWithState() (no gaps)', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    const items = checklist.getItemsWithState();
    // All 7 items are returned with the correct structure for keyboard-driven UI
    expect(items).toHaveLength(INSPECTION_CHECKLIST_ITEMS.length);
    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('label');
      expect(item).toHaveProperty('tooltip');
      expect(item).toHaveProperty('state');
    }
  });

  test('each item has a stable non-empty id suitable for aria-label / tabIndex binding', () => {
    for (const item of INSPECTION_CHECKLIST_ITEMS) {
      expect(typeof item.id).toBe('string');
      expect(item.id.trim().length).toBeGreaterThan(0);
      // No spaces (valid HTML id / aria-label attribute token)
      expect(item.id).not.toMatch(/\s/);
    }
  });

  test('reviewItem() can be called independently per id (supports non-sequential keyboard nav)', () => {
    const { checklist } = makeChecklist();
    checklist.begin('job-001');
    // Review in reverse order (as a keyboard user might tab and select backwards)
    const reversed = [...INSPECTION_CHECKLIST_ITEMS].reverse();
    for (const item of reversed) {
      const result = checklist.reviewItem(item.id, ITEM_STATES.REVIEWED_NORMAL);
      expect(result).toBe(true);
    }
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
  });
});

// ─── Scenario 9: Edge case — job reload mid-checklist ────────────────────────

describe('Scenario 9 — Job reload mid-checklist restores state', () => {
  test('item states are persisted to PlayerSaveState after each reviewItem() call', () => {
    const { checklist, saveState } = makeChecklist();
    checklist.begin('job-001');
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem(INSPECTION_CHECKLIST_ITEMS[1].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    // Persisted state should be in save state
    const persisted = saveState.get('intake_checklist_item_states');
    expect(persisted).not.toBeNull();
    expect(persisted[INSPECTION_CHECKLIST_ITEMS[0].id]).toBe(ITEM_STATES.REVIEWED_NORMAL);
    expect(persisted[INSPECTION_CHECKLIST_ITEMS[1].id]).toBe(ITEM_STATES.REVIEWED_ISSUE_NOTED);
  });

  test('after job reload, previously reviewed items remain reviewed', () => {
    // Simulate: review 3 items, persist state, then re-create checklist from same saveState
    const saveState = new PlayerSaveState();
    const jobStore = makeJobStore();
    const annotationWriter = new JobCardAnnotationWriter(jobStore);

    const firstSession = new IntakeInspectionChecklist(annotationWriter, saveState);
    firstSession.begin('job-001');
    firstSession.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    firstSession.reviewItem(INSPECTION_CHECKLIST_ITEMS[1].id, ITEM_STATES.REVIEWED_NORMAL);
    firstSession.reviewItem(INSPECTION_CHECKLIST_ITEMS[2].id, ITEM_STATES.REVIEWED_ISSUE_NOTED);
    // Simulate close — persisted state is now in saveState

    // Simulate reopen — new checklist instance, same saveState (same persisted data)
    const secondSession = new IntakeInspectionChecklist(annotationWriter, saveState);
    secondSession.begin('job-001');

    expect(secondSession.getItemState(INSPECTION_CHECKLIST_ITEMS[0].id)).toBe(ITEM_STATES.REVIEWED_NORMAL);
    expect(secondSession.getItemState(INSPECTION_CHECKLIST_ITEMS[1].id)).toBe(ITEM_STATES.REVIEWED_NORMAL);
    expect(secondSession.getItemState(INSPECTION_CHECKLIST_ITEMS[2].id)).toBe(ITEM_STATES.REVIEWED_ISSUE_NOTED);
    expect(secondSession.getReviewedCount()).toBe(3);
  });

  test('after job reload, remaining items are still not-reviewed', () => {
    const saveState = new PlayerSaveState();
    const jobStore = makeJobStore();
    const annotationWriter = new JobCardAnnotationWriter(jobStore);

    const firstSession = new IntakeInspectionChecklist(annotationWriter, saveState);
    firstSession.begin('job-001');
    firstSession.reviewItem(INSPECTION_CHECKLIST_ITEMS[0].id, ITEM_STATES.REVIEWED_NORMAL);
    // Only 1 of 7 reviewed — save and reload

    const secondSession = new IntakeInspectionChecklist(annotationWriter, saveState);
    secondSession.begin('job-001');
    // Items 1-6 should still be not-reviewed
    for (let i = 1; i < INSPECTION_CHECKLIST_ITEMS.length; i++) {
      expect(secondSession.getItemState(INSPECTION_CHECKLIST_ITEMS[i].id)).toBe(ITEM_STATES.NOT_REVIEWED);
    }
    expect(secondSession.isDisassemblyUnlocked()).toBe(false);
  });

  test('intake_checklist_item_states is cleared from save state after complete()', () => {
    const { checklist, saveState } = makeChecklist();
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    expect(saveState.get('intake_checklist_item_states')).toBeNull();
  });

  test('PlayerSaveState includes intake_checklist_item_states with null default', () => {
    const saveState = new PlayerSaveState();
    expect(saveState.get('intake_checklist_item_states')).toBeNull();
  });
});

// ─── Scenario 10: End-to-end flow integration ─────────────────────────────────

describe('Scenario 10 — End-to-end first-job flow (Scenario 1 + integration)', () => {
  test('full happy path: begin → review all → unlock → complete → annotations written', () => {
    const { checklist, jobStore } = makeChecklist();

    // Step 1: Start first job — checklist activates, disassembly locked
    const active = checklist.begin('job-001');
    expect(active).toBe(true);
    expect(checklist.isDisassemblyUnlocked()).toBe(false);

    // Step 2: Review all items (mix of states for realism)
    checklist.reviewItem('case_exterior', ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem('crystal_integrity', ITEM_STATES.REVIEWED_ISSUE_NOTED);
    checklist.reviewItem('crown_stem', ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem('caseback', ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem('bracelet_strap', ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem('moisture_corrosion', ITEM_STATES.REVIEWED_NORMAL);
    checklist.reviewItem('audible_movement', ITEM_STATES.REVIEWED_NORMAL);

    // Step 3: Gate opens
    expect(checklist.isDisassemblyUnlocked()).toBe(true);
    expect(checklist.getBypassLockTooltip()).toBeNull();

    // Step 4: Complete checklist — writes annotations to job card
    const result = checklist.complete();
    expect(result.success).toBe(true);
    expect(result.annotations).toHaveLength(7);

    // Step 5: Verify job card has annotations
    const stored = jobStore.getAnnotations('job-001');
    expect(stored).toHaveLength(7);
    // Crystal was issue-noted
    const crystalAnnotation = stored.find(a => a.key === 'Crystal Integrity');
    expect(crystalAnnotation.value).toBe('Issue noted');

    // Step 6: Verify no state corruption — checklist no longer active
    expect(checklist.isActive()).toBe(false);
  });

  test('second job does not trigger checklist gate after first job completed', () => {
    const { checklist, saveState } = makeChecklist();
    // Complete first job
    checklist.begin('job-001');
    reviewAllItems(checklist);
    checklist.complete();
    expect(saveState.get('first_job_completed')).toBe(true);

    // Start second job using the same saveState
    const jobStore2 = makeJobStore();
    const writer2 = new JobCardAnnotationWriter(jobStore2);
    const checklist2 = new IntakeInspectionChecklist(writer2, saveState);
    const active2 = checklist2.begin('job-002');

    expect(active2).toBe(false);
    expect(checklist2.isDisassemblyUnlocked()).toBe(true);
    expect(checklist2.getBypassLockTooltip()).toBeNull();
  });

  test('no errors or state corruption when complete() is called on subsequent job checklist', () => {
    const { checklist } = makeChecklist({ first_job_completed: true });
    checklist.begin('job-002');
    // complete() on a non-active checklist returns failure gracefully
    const result = checklist.complete();
    expect(result.success).toBe(false);
    expect(result.annotations).toBeNull();
  });
});

// ─── JobCardAnnotationWriter standalone tests ─────────────────────────────────

describe('JobCardAnnotationWriter — annotation persistence', () => {
  test('writeAnnotations() delegates to jobStore.annotate()', () => {
    const jobStore = makeJobStore();
    const writer = new JobCardAnnotationWriter(jobStore);
    const fakeItems = [
      { id: 'case_exterior', label: 'Case Exterior Condition', tooltip: 'tip', state: 'reviewed-normal' },
      { id: 'crystal_integrity', label: 'Crystal Integrity', tooltip: 'tip', state: 'reviewed-issue-noted' },
    ];
    const annotations = writer.writeAnnotations('job-XYZ', fakeItems);
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toEqual({ key: 'Case Exterior Condition', value: 'Normal — no issues noted' });
    expect(annotations[1]).toEqual({ key: 'Crystal Integrity', value: 'Issue noted' });
    expect(jobStore.getAnnotations('job-XYZ')).toEqual(annotations);
  });

  test('writeAnnotations() skips not-reviewed items', () => {
    const jobStore = makeJobStore();
    const writer = new JobCardAnnotationWriter(jobStore);
    const fakeItems = [
      { id: 'case_exterior', label: 'Case Exterior Condition', tooltip: 'tip', state: 'not-reviewed' },
      { id: 'crystal_integrity', label: 'Crystal Integrity', tooltip: 'tip', state: 'reviewed-normal' },
    ];
    const annotations = writer.writeAnnotations('job-XYZ', fakeItems);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].key).toBe('Crystal Integrity');
  });

  test('getAnnotations() returns null for unknown job id', () => {
    const jobStore = makeJobStore();
    const writer = new JobCardAnnotationWriter(jobStore);
    expect(writer.getAnnotations('job-unknown')).toBeNull();
  });
});
