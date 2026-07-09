/**
 * Tests for AC1 — Symptom-to-Part Visual Mapping Overlay
 *
 * AC1: When a player clicks a visible watch symptom in the diagnosis view,
 * a symptom-to-part overlay highlights all plausible candidate components on
 * the watch anatomy diagram within 1 second.
 *
 * Scenario 6: Multi-cause symptom mapping — overlay highlights ALL plausible
 * parts simultaneously.
 * Scenario 9: Performance — overlay renders within 1 second on minimum spec.
 */

const { SymptomOverlay } = require('../../src/diagnosis/SymptomOverlay');
const { SYMPTOM_PARTS_MAP, getPartsForSymptom } = require('../../src/data/symptom-parts-map');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOverlay() {
  const calls = [];
  const clearCalls = [];

  const renderOverlay = (symptomKey, partIds) => calls.push({ symptomKey, partIds });
  const clearOverlay = () => clearCalls.push(true);

  const overlay = new SymptomOverlay(renderOverlay, clearOverlay);
  return { overlay, calls, clearCalls };
}

// ─── AC1: Basic symptom click triggers overlay ────────────────────────────────

describe('AC1 — SymptomOverlay: symptom click highlights candidate parts', () => {
  test('clicking a symptom calls the renderOverlay function with the symptom key', () => {
    const { overlay, calls } = makeOverlay();
    overlay.onSymptomClicked('stops_running');
    expect(calls).toHaveLength(1);
    expect(calls[0].symptomKey).toBe('stops_running');
  });

  test('clicking a symptom returns the highlighted parts list', () => {
    const { overlay } = makeOverlay();
    const result = overlay.onSymptomClicked('loses_time');
    expect(result.highlightedParts).toEqual(getPartsForSymptom('loses_time'));
    expect(result.highlightedParts.length).toBeGreaterThan(0);
  });

  test('getCurrentSymptom reflects the last clicked symptom', () => {
    const { overlay } = makeOverlay();
    overlay.onSymptomClicked('crown_wont_engage');
    expect(overlay.getCurrentSymptom()).toBe('crown_wont_engage');
  });

  test('getHighlightedParts returns a non-empty array after a symptom click', () => {
    const { overlay } = makeOverlay();
    overlay.onSymptomClicked('no_power_reserve');
    const parts = overlay.getHighlightedParts();
    expect(Array.isArray(parts)).toBe(true);
    expect(parts.length).toBeGreaterThan(0);
  });

  test('clearOverlay resets current state and calls the injected clear fn', () => {
    const { overlay, clearCalls } = makeOverlay();
    overlay.onSymptomClicked('stops_running');
    overlay.clearOverlay();
    expect(overlay.getCurrentSymptom()).toBeNull();
    expect(overlay.getHighlightedParts()).toHaveLength(0);
    expect(clearCalls).toHaveLength(1);
  });
});

// ─── Scenario 6: Multi-cause symptoms highlight ALL plausible parts ────────────

describe('Scenario 6 — Multi-cause symptom highlights all plausible parts simultaneously', () => {
  test('"stops_running" maps to multiple parts (mainspring, escapement, balance_wheel, pallet_fork)', () => {
    const { overlay } = makeOverlay();
    const result = overlay.onSymptomClicked('stops_running');
    expect(result.highlightedParts).toContain('mainspring');
    expect(result.highlightedParts).toContain('escapement');
    expect(result.highlightedParts).toContain('balance_wheel');
    expect(result.highlightedParts.length).toBeGreaterThanOrEqual(3);
  });

  test('"loses_time" maps to multiple parts', () => {
    const parts = getPartsForSymptom('loses_time');
    expect(parts.length).toBeGreaterThan(1);
  });

  test('all symptom entries in the data map have array values', () => {
    Object.entries(SYMPTOM_PARTS_MAP).forEach(([symptom, parts]) => {
      expect(Array.isArray(parts)).toBe(true);
      expect(parts.length).toBeGreaterThan(0);
    });
  });
});

// ─── Scenario 9: Performance — render within 1 second ─────────────────────────

describe('Scenario 9 — Symptom overlay renders within 1 second', () => {
  test('render callback is invoked synchronously (< 1000ms budget)', () => {
    const { overlay } = makeOverlay(); // renderOverlay is a no-op; measures only lookup + call
    const result = overlay.onSymptomClicked('stops_running');
    // The data lookup itself must complete in well under 1 second
    expect(result.renderDurationMs).toBeLessThan(1000);
  });

  test('getLastRenderDurationMs returns a non-negative number after a click', () => {
    const { overlay } = makeOverlay();
    overlay.onSymptomClicked('gains_time');
    expect(overlay.getLastRenderDurationMs()).toBeGreaterThanOrEqual(0);
  });

  test('getLastRenderDurationMs is null before any click', () => {
    const { overlay } = makeOverlay();
    expect(overlay.getLastRenderDurationMs()).toBeNull();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('SymptomOverlay — edge cases', () => {
  test('unknown symptom returns an empty highlighted parts array', () => {
    const { overlay, calls } = makeOverlay();
    const result = overlay.onSymptomClicked('nonexistent_symptom');
    expect(result.highlightedParts).toHaveLength(0);
    expect(calls).toHaveLength(1); // render is still called (UI can show "no specific parts")
  });

  test('clicking multiple symptoms in sequence updates state correctly', () => {
    const { overlay } = makeOverlay();
    overlay.onSymptomClicked('stops_running');
    overlay.onSymptomClicked('loses_time');
    expect(overlay.getCurrentSymptom()).toBe('loses_time');
  });

  test('constructor throws if renderOverlay is not a function', () => {
    expect(() => new SymptomOverlay(null, () => {})).toThrow();
  });

  test('constructor throws if clearOverlay is not a function', () => {
    expect(() => new SymptomOverlay(() => {}, null)).toThrow();
  });
});
