/**
 * Tests: DiagnosisSessionRecord — Issue #117 AC3, AC4
 *
 * AC3: Session-level A/B arm assigned once at creation (~50/50); restored from
 *      snapshot without re-randomisation; invalid arm throws.
 *
 * AC4: time-before-first-hint and diagnosis-without-hint % tracked per session;
 *      data retrievable for post-test analysis via getSessionMetrics().
 *
 * Test Scenarios covered:
 *   Scenario 5  — control group arm persists for session lifetime
 *   Scenario 6  — treatment group arm persists for session lifetime
 *   Scenario 9  — A/B assignment persistence: session reload keeps same arm
 *   Scenario 8  — hint used after cue: time-before-first-hint recorded correctly
 *
 * Run with: npm test
 */

const { DiagnosisSessionRecord } = require('../../src/state/DiagnosisSessionRecord');

// ── AC3: Arm assignment ────────────────────────────────────────────────────────

describe('DiagnosisSessionRecord — AC3: arm assigned once at session creation', () => {
  test('new record with randomSource always < 0.5 is assigned "treatment"', () => {
    const rec = new DiagnosisSessionRecord({ randomSource: () => 0.1 });
    expect(rec.arm).toBe('treatment');
  });

  test('new record with randomSource always >= 0.5 is assigned "control"', () => {
    const rec = new DiagnosisSessionRecord({ randomSource: () => 0.9 });
    expect(rec.arm).toBe('control');
  });

  test('explicit arm "treatment" is respected (session restore path)', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    expect(rec.arm).toBe('treatment');
  });

  test('explicit arm "control" is respected (session restore path)', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'control' });
    expect(rec.arm).toBe('control');
  });

  test('invalid arm value throws an error', () => {
    expect(() => new DiagnosisSessionRecord({ arm: 'experimental' })).toThrow();
    expect(() => new DiagnosisSessionRecord({ arm: '' })).toThrow();
  });

  test('arm is a string ("treatment" or "control") when randomly assigned', () => {
    for (let i = 0; i < 20; i++) {
      const rec = new DiagnosisSessionRecord();
      expect(['treatment', 'control']).toContain(rec.arm);
    }
  });

  test('~50/50 split: rough distribution over many records (tolerance ±20%)', () => {
    let treatment = 0;
    let control = 0;
    for (let i = 0; i < 1000; i++) {
      const rec = new DiagnosisSessionRecord();
      if (rec.arm === 'treatment') treatment++;
      else control++;
    }
    // Allow ±20% tolerance around 50%
    expect(treatment).toBeGreaterThan(300);
    expect(treatment).toBeLessThan(700);
  });
});

// ── AC3: Scenario 9 — session reload keeps same arm ───────────────────────────

describe('DiagnosisSessionRecord — AC3 Scenario 9: session restore does not re-randomise', () => {
  test('fromSnapshot restores the exact arm from the snapshot', () => {
    const original = new DiagnosisSessionRecord({ arm: 'treatment', sessionId: 'sess-1' });
    const snapshot = original.toSerializable();
    const restored = DiagnosisSessionRecord.fromSnapshot(snapshot);

    expect(restored.arm).toBe('treatment');
    expect(restored.sessionId).toBe('sess-1');
  });

  test('fromSnapshot with control arm restores control arm', () => {
    const original = new DiagnosisSessionRecord({ arm: 'control', sessionId: 'sess-2' });
    const restored = DiagnosisSessionRecord.fromSnapshot(original.toSerializable());
    expect(restored.arm).toBe('control');
  });

  test('toSerializable includes sessionId and arm', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment', sessionId: 'sess-3' });
    const snap = rec.toSerializable();
    expect(snap).toHaveProperty('arm', 'treatment');
    expect(snap).toHaveProperty('sessionId', 'sess-3');
  });
});

// ── AC4: Session timing ────────────────────────────────────────────────────────

describe('DiagnosisSessionRecord — AC4: diagnosis session timing', () => {
  test('startDiagnosis records start time', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.startDiagnosis(1000);
    expect(rec.getTimeBeforeFirstHint()).toBeNull(); // no hint yet
  });

  test('startDiagnosis is idempotent — second call does not overwrite', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.startDiagnosis(1000);
    rec.startDiagnosis(9999); // second call — should be ignored
    rec.recordFirstHintRequest(2000);
    expect(rec.getTimeBeforeFirstHint()).toBe(1000); // 2000 - 1000
  });

  test('recordFirstHintRequest is idempotent — only first call counts', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.startDiagnosis(1000);
    rec.recordFirstHintRequest(1500);
    rec.recordFirstHintRequest(9999); // second call — should be ignored
    expect(rec.getTimeBeforeFirstHint()).toBe(500); // 1500 - 1000
  });
});

// ── AC4: time-before-first-hint ────────────────────────────────────────────────

describe('DiagnosisSessionRecord — AC4: time-before-first-hint', () => {
  test('returns elapsed ms from diagnosis start to first hint request', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.startDiagnosis(0);
    rec.recordFirstHintRequest(3000);
    expect(rec.getTimeBeforeFirstHint()).toBe(3000);
  });

  test('returns null when no hint was requested (diagnosis without hint)', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.startDiagnosis(0);
    // no recordFirstHintRequest call
    expect(rec.getTimeBeforeFirstHint()).toBeNull();
  });

  test('returns null when startDiagnosis was never called', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.recordFirstHintRequest(1000);
    expect(rec.getTimeBeforeFirstHint()).toBeNull();
  });
});

// ── AC4: diagnosis-without-hint % ─────────────────────────────────────────────

describe('DiagnosisSessionRecord — AC4: diagnosis-without-hint %', () => {
  test('getDiagnosedWithoutHint returns null before completeDiagnosis is called', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    expect(rec.getDiagnosedWithoutHint()).toBeNull();
  });

  test('completeDiagnosis(true) records diagnosis without hint', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.completeDiagnosis(true);
    expect(rec.getDiagnosedWithoutHint()).toBe(true);
  });

  test('completeDiagnosis(false) records hint was used', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment' });
    rec.completeDiagnosis(false);
    expect(rec.getDiagnosedWithoutHint()).toBe(false);
  });
});

// ── AC4: getSessionMetrics for post-test analysis ─────────────────────────────

describe('DiagnosisSessionRecord — AC4: getSessionMetrics', () => {
  test('full metrics snapshot includes all required fields', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'treatment', sessionId: 'sess-10' });
    rec.startDiagnosis(0);
    rec.recordFirstHintRequest(2500);
    rec.completeDiagnosis(false);

    const metrics = rec.getSessionMetrics();

    expect(metrics.sessionId).toBe('sess-10');
    expect(metrics.arm).toBe('treatment');
    expect(metrics.timeBeforeFirstHintMs).toBe(2500);
    expect(metrics.diagnosedWithoutHint).toBe(false);
    expect(metrics.diagnosisCompleted).toBe(true);
  });

  test('metrics snapshot for hint-free session has null timeBeforeFirstHintMs', () => {
    const rec = new DiagnosisSessionRecord({ arm: 'control', sessionId: 'sess-11' });
    rec.startDiagnosis(0);
    rec.completeDiagnosis(true);

    const metrics = rec.getSessionMetrics();
    expect(metrics.timeBeforeFirstHintMs).toBeNull();
    expect(metrics.diagnosedWithoutHint).toBe(true);
    expect(metrics.arm).toBe('control');
  });

  test('metrics snapshot is segmented by arm (AC4 — retrievable for post-test analysis)', () => {
    const treatmentRec = new DiagnosisSessionRecord({ arm: 'treatment' });
    const controlRec   = new DiagnosisSessionRecord({ arm: 'control' });

    expect(treatmentRec.getSessionMetrics().arm).toBe('treatment');
    expect(controlRec.getSessionMetrics().arm).toBe('control');
  });
});