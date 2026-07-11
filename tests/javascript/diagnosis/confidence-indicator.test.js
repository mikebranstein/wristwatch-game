/**
 * Tests for the ConfidenceIndicator
 *
 * Scenario 7: As player selects and deselects candidate parts, the diagnosis
 * confidence indicator updates in real time; selecting the correct primary
 * part shows "Likely"; selecting an unrelated part shows "Unlikely".
 */

const { ConfidenceIndicator, CONFIDENCE } = require('../../../javascript/diagnosis/ConfidenceIndicator');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEventBus() {
  const handlers = {};
  return {
    on(event, handler) {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    off(event, handler) {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach((h) => h(...args));
    },
    _handlers: handlers,
  };
}

function makeIndicator(candidates = []) {
  const updates = [];
  const bus = makeEventBus();
  const indicator = new ConfidenceIndicator(bus, (conf) => updates.push(conf));
  if (candidates.length) indicator.setActiveCandidateParts(candidates);
  return { indicator, bus, updates };
}

// ─── Scenario 7: Real-time confidence updates ─────────────────────────────────

describe('Scenario 7 — Confidence indicator updates in real time', () => {
  test('selecting the primary (first) candidate part shows "Likely"', () => {
    const { indicator, bus } = makeIndicator(['mainspring', 'escapement', 'balance_wheel']);
    bus.emit('part:selected', 'mainspring');
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.LIKELY);
  });

  test('selecting a secondary candidate part shows "Possible"', () => {
    const { indicator, bus } = makeIndicator(['mainspring', 'escapement', 'balance_wheel']);
    bus.emit('part:selected', 'escapement');
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.POSSIBLE);
  });

  test('selecting an unrelated part shows "Unlikely"', () => {
    const { indicator, bus } = makeIndicator(['mainspring', 'escapement']);
    bus.emit('part:selected', 'dial'); // not in candidates
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.UNLIKELY);
  });

  test('deselecting a part resets confidence to "None"', () => {
    const { indicator, bus } = makeIndicator(['mainspring']);
    bus.emit('part:selected', 'mainspring');
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.LIKELY);
    bus.emit('part:deselected');
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.NONE);
  });

  test('onUpdate callback is invoked when confidence changes', () => {
    const { bus, updates } = makeIndicator(['pallet_fork', 'escape_wheel']);
    bus.emit('part:selected', 'pallet_fork');
    expect(updates).toContain(CONFIDENCE.LIKELY);
  });

  test('onUpdate callback is NOT invoked when confidence value does not change', () => {
    const { bus, updates } = makeIndicator(['balance_wheel']);
    bus.emit('part:selected', 'balance_wheel');
    const count = updates.length;
    bus.emit('part:selected', 'balance_wheel'); // same selection again
    expect(updates.length).toBe(count); // no extra callback
  });
});

// ─── computeConfidence ─────────────────────────────────────────────────────────

describe('ConfidenceIndicator.computeConfidence', () => {
  test('returns LIKELY for the first candidate', () => {
    const { indicator } = makeIndicator(['mainspring', 'escapement']);
    expect(indicator.computeConfidence('mainspring')).toBe(CONFIDENCE.LIKELY);
  });

  test('returns POSSIBLE for any non-primary candidate', () => {
    const { indicator } = makeIndicator(['mainspring', 'escapement', 'balance_wheel']);
    expect(indicator.computeConfidence('escapement')).toBe(CONFIDENCE.POSSIBLE);
    expect(indicator.computeConfidence('balance_wheel')).toBe(CONFIDENCE.POSSIBLE);
  });

  test('returns UNLIKELY when part is not in candidate list', () => {
    const { indicator } = makeIndicator(['mainspring']);
    expect(indicator.computeConfidence('dial')).toBe(CONFIDENCE.UNLIKELY);
  });

  test('returns NONE when partId is null', () => {
    const { indicator } = makeIndicator(['mainspring']);
    expect(indicator.computeConfidence(null)).toBe(CONFIDENCE.NONE);
  });

  test('returns NONE when no candidate parts are set', () => {
    const { indicator } = makeIndicator([]); // no candidates set
    expect(indicator.computeConfidence('mainspring')).toBe(CONFIDENCE.NONE);
  });
});

// ─── setActiveCandidateParts ──────────────────────────────────────────────────

describe('ConfidenceIndicator.setActiveCandidateParts', () => {
  test('recalculates confidence when candidate list changes mid-session', () => {
    const { indicator, bus } = makeIndicator(['mainspring']);
    bus.emit('part:selected', 'escapement'); // not in current candidates → Unlikely
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.UNLIKELY);

    // New symptom clicked — escapement now IS in candidates
    indicator.setActiveCandidateParts(['escapement', 'pallet_fork']);
    expect(indicator.getCurrentConfidence()).toBe(CONFIDENCE.LIKELY);
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────

describe('ConfidenceIndicator.destroy', () => {
  test('unsubscribes from eventBus — no updates after destroy', () => {
    const { indicator, bus, updates } = makeIndicator(['mainspring']);
    indicator.destroy();
    const countBefore = updates.length;
    bus.emit('part:selected', 'mainspring');
    expect(updates.length).toBe(countBefore); // no new callbacks
  });
});

// ─── Constructor guards ────────────────────────────────────────────────────────

describe('ConfidenceIndicator — constructor guards', () => {
  test('throws if eventBus is missing .on()', () => {
    expect(() => new ConfidenceIndicator({}, () => {})).toThrow();
    expect(() => new ConfidenceIndicator(null, () => {})).toThrow();
  });

  test('throws if onUpdate is not a function', () => {
    const bus = makeEventBus();
    expect(() => new ConfidenceIndicator(bus, null)).toThrow();
  });
});
