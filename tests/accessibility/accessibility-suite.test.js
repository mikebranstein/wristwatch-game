/**
 * tests/accessibility/accessibility-suite.test.js
 * =================================================
 * Automated tests for the Accessibility Suite — Issue #115.
 *
 * Acceptance Criteria Coverage:
 *   AC1 — CVD palette mode selection: remaps color-sole-differentiator states safely.
 *   AC2 — UI scale slider (80–150%): applies correctly, guards boundaries, persists.
 *   AC3 — Snap-tolerance assist: measurably wider radius at Assisted / High Assist.
 *   AC4 — Settings persistence: fromSaveData / toSaveData round-trip.
 *   AC5 — Default (no CVD mode): visuals unchanged from baseline.
 *
 * Test command: npm test -- --testPathPattern=accessibility-suite
 */

'use strict';

const { CvdPaletteManager, CVD_PALETTES, VALID_MODES } = require('../../src/accessibility/CvdPaletteManager');
const { UiScaleManager, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT } = require('../../src/accessibility/UiScaleManager');
const { AccessibilitySettingsScreen, SNAP_TOLERANCE_LEVELS, ASSIST_MULTIPLIERS } = require('../../src/accessibility/AccessibilitySettingsScreen');

// ============================================================================
// AC1 — CVD Palette Mode
// ============================================================================

describe('AC1 — CvdPaletteManager', () => {
  test('constructs with null (baseline) without throwing', () => {
    expect(() => new CvdPaletteManager(null)).not.toThrow();
  });

  test.each(['deuteranopia', 'protanopia', 'tritanopia'])(
    'constructs with mode=%s without throwing',
    (mode) => {
      expect(() => new CvdPaletteManager(mode)).not.toThrow();
    }
  );

  test('throws for unrecognised mode', () => {
    expect(() => new CvdPaletteManager('my_custom_mode')).toThrow();
  });

  test('deuteranopia remaps WRONG_ORI red (#ef5350) to orange (#e69f00)', () => {
    const mgr = new CvdPaletteManager('deuteranopia');
    expect(mgr.remapHex('#ef5350')).toBe('#e69f00');
  });

  test('deuteranopia remaps LOCKED_IN green (#66bb6a) to blue (#0072b2)', () => {
    const mgr = new CvdPaletteManager('deuteranopia');
    expect(mgr.remapHex('#66bb6a')).toBe('#0072b2');
  });

  test('protanopia remaps WRONG_ORI red to orange (same axis as deuteranopia)', () => {
    const mgr = new CvdPaletteManager('protanopia');
    expect(mgr.remapHex('#ef5350')).toBe('#e69f00');
  });

  test('tritanopia remaps PROXIMITY cyan (#4fc3f7) to magenta (#cc79a7)', () => {
    const mgr = new CvdPaletteManager('tritanopia');
    expect(mgr.remapHex('#4fc3f7')).toBe('#cc79a7');
  });

  test('tritanopia remaps LOCKED_IN green (#66bb6a) to teal (#009e73)', () => {
    const mgr = new CvdPaletteManager('tritanopia');
    expect(mgr.remapHex('#66bb6a')).toBe('#009e73');
  });

  test('color not in palette is returned unchanged', () => {
    const mgr = new CvdPaletteManager('deuteranopia');
    expect(mgr.remapHex('#ffffff')).toBe('#ffffff');
  });

  test('remapHex(null) returns null', () => {
    const mgr = new CvdPaletteManager('deuteranopia');
    expect(mgr.remapHex(null)).toBeNull();
  });

  test('remapStateVisuals returns new object with remapped colors', () => {
    const mgr = new CvdPaletteManager('deuteranopia');
    const visuals = {
      3: { highlight: true, color: '#ef5350', glow: 0.7, animation: 'shake' },
      4: { highlight: true, color: '#66bb6a', glow: 1.0, animation: 'lock-flash' },
    };
    const remapped = mgr.remapStateVisuals(visuals);
    expect(remapped[3].color).toBe('#e69f00');
    expect(remapped[4].color).toBe('#0072b2');
    // Other fields preserved
    expect(remapped[3].animation).toBe('shake');
  });

  test('remapStateVisuals does NOT mutate the input object', () => {
    const mgr = new CvdPaletteManager('protanopia');
    const visuals = { 3: { color: '#ef5350' } };
    mgr.remapStateVisuals(visuals);
    expect(visuals[3].color).toBe('#ef5350'); // input unchanged
  });

  test('VALID_MODES includes null and all three CVD modes', () => {
    expect(VALID_MODES).toContain(null);
    expect(VALID_MODES).toContain('deuteranopia');
    expect(VALID_MODES).toContain('protanopia');
    expect(VALID_MODES).toContain('tritanopia');
  });

  test('CVD_PALETTES has entries for all three modes', () => {
    expect(Object.keys(CVD_PALETTES)).toEqual(
      expect.arrayContaining(['deuteranopia', 'protanopia', 'tritanopia'])
    );
  });
});

// ============================================================================
// AC2 — UI Scale Manager
// ============================================================================

describe('AC2 — UiScaleManager', () => {
  test('default scale is 100', () => {
    const mgr = new UiScaleManager();
    expect(mgr.scalePct).toBe(100);
  });

  test('apply() scales base value correctly', () => {
    const mgr = new UiScaleManager(130);
    expect(mgr.apply(16)).toBeCloseTo(20.8);
  });

  test('applyInt() rounds to nearest integer', () => {
    const mgr = new UiScaleManager(130);
    expect(mgr.applyInt(16)).toBe(21);
  });

  test('multiplier is scalePct / 100', () => {
    const mgr = new UiScaleManager(130);
    expect(mgr.multiplier).toBeCloseTo(1.3);
  });

  test('minimum scale (80%) accepted', () => {
    expect(() => new UiScaleManager(80)).not.toThrow();
    expect(new UiScaleManager(80).scalePct).toBe(80);
  });

  test('maximum scale (150%) accepted', () => {
    expect(() => new UiScaleManager(150)).not.toThrow();
    expect(new UiScaleManager(150).scalePct).toBe(150);
  });

  test('scale below 80 throws RangeError', () => {
    expect(() => new UiScaleManager(79.9)).toThrow(RangeError);
  });

  test('scale above 150 throws RangeError', () => {
    expect(() => new UiScaleManager(150.1)).toThrow(RangeError);
  });

  test('isValidScale returns true for boundary values', () => {
    expect(UiScaleManager.isValidScale(80)).toBe(true);
    expect(UiScaleManager.isValidScale(150)).toBe(true);
    expect(UiScaleManager.isValidScale(100)).toBe(true);
  });

  test('isValidScale returns false for out-of-range values', () => {
    expect(UiScaleManager.isValidScale(79)).toBe(false);
    expect(UiScaleManager.isValidScale(151)).toBe(false);
  });

  test('minimum() factory returns 80% scale', () => {
    expect(UiScaleManager.minimum().scalePct).toBe(UI_SCALE_MIN);
  });

  test('maximum() factory returns 150% scale', () => {
    expect(UiScaleManager.maximum().scalePct).toBe(UI_SCALE_MAX);
  });

  test('default() factory returns 100% scale', () => {
    expect(UiScaleManager.default().scalePct).toBe(UI_SCALE_DEFAULT);
  });

  // Layout regression checks at boundary values (AC2)
  test('at 80% scale, 100px base → 80px (no underflow beyond min)', () => {
    expect(UiScaleManager.minimum().apply(100)).toBe(80);
  });

  test('at 150% scale, 100px base → 150px (no overflow beyond max)', () => {
    expect(UiScaleManager.maximum().apply(100)).toBe(150);
  });
});

// ============================================================================
// AC3 — Snap-Tolerance Assist
// ============================================================================

describe('AC3 — AccessibilitySettingsScreen snap tolerance', () => {
  const BASE = { approach_radius: 60, lock_radius: 20 };

  test('Standard level leaves radii unchanged', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('standard');
    const adj = screen.adjustSnapTolerance(BASE);
    expect(adj.approach_radius).toBe(60);
    expect(adj.lock_radius).toBe(20);
  });

  test('Assisted level widens approach_radius by 50%', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('assisted');
    const adj = screen.adjustSnapTolerance(BASE);
    expect(adj.approach_radius).toBeCloseTo(90);
  });

  test('Assisted level widens lock_radius by 50%', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('assisted');
    const adj = screen.adjustSnapTolerance(BASE);
    expect(adj.lock_radius).toBeCloseTo(30);
  });

  test('High Assist doubles approach_radius', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('high_assist');
    const adj = screen.adjustSnapTolerance(BASE);
    expect(adj.approach_radius).toBeCloseTo(120);
  });

  test('High Assist doubles lock_radius', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('high_assist');
    const adj = screen.adjustSnapTolerance(BASE);
    expect(adj.lock_radius).toBeCloseTo(40);
  });

  test('Assisted lock_radius > Standard lock_radius (AC3 measurable)', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('standard');
    const std = screen.adjustSnapTolerance(BASE);
    screen.setSnapToleranceLevel('assisted');
    const ast = screen.adjustSnapTolerance(BASE);
    expect(ast.lock_radius).toBeGreaterThan(std.lock_radius);
  });

  test('High Assist lock_radius > Assisted lock_radius (AC3 measurable)', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setSnapToleranceLevel('assisted');
    const ast = screen.adjustSnapTolerance(BASE);
    screen.setSnapToleranceLevel('high_assist');
    const hi = screen.adjustSnapTolerance(BASE);
    expect(hi.lock_radius).toBeGreaterThan(ast.lock_radius);
  });

  test('2× constraint preserved at all levels', () => {
    const screen = new AccessibilitySettingsScreen();
    for (const level of SNAP_TOLERANCE_LEVELS) {
      screen.setSnapToleranceLevel(level);
      const adj = screen.adjustSnapTolerance(BASE);
      expect(adj.approach_radius).toBeGreaterThanOrEqual(2 * adj.lock_radius);
    }
  });

  test('invalid snap tolerance level throws', () => {
    const screen = new AccessibilitySettingsScreen();
    expect(() => screen.setSnapToleranceLevel('turbo')).toThrow();
  });

  test('ASSIST_MULTIPLIERS has entries for all three levels', () => {
    for (const level of SNAP_TOLERANCE_LEVELS) {
      expect(ASSIST_MULTIPLIERS[level]).toBeDefined();
      expect(typeof ASSIST_MULTIPLIERS[level].approach).toBe('number');
      expect(typeof ASSIST_MULTIPLIERS[level].lock).toBe('number');
    }
  });
});

// ============================================================================
// AC4 — Settings Persistence
// ============================================================================

describe('AC4 — AccessibilitySettingsScreen persistence', () => {
  test('toSaveData() includes all three fields', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setCvdMode('deuteranopia');
    screen.setUiScale(130);
    screen.setSnapToleranceLevel('high_assist');
    const data = screen.toSaveData();
    expect(data.cvd_mode).toBe('deuteranopia');
    expect(data.ui_scale).toBe(130);
    expect(data.snap_tolerance_level).toBe('high_assist');
  });

  test('fromSaveData() restores all three fields', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.fromSaveData({
      cvd_mode: 'protanopia',
      ui_scale: 120,
      snap_tolerance_level: 'assisted',
    });
    expect(screen.cvdMode).toBe('protanopia');
    expect(screen.uiScalePct).toBe(120);
    expect(screen.snapToleranceLevel).toBe('assisted');
  });

  test('round-trip toSaveData → fromSaveData preserves settings', () => {
    const screen1 = new AccessibilitySettingsScreen();
    screen1.setCvdMode('tritanopia');
    screen1.setUiScale(80);
    screen1.setSnapToleranceLevel('assisted');
    const saved = screen1.toSaveData();

    const screen2 = new AccessibilitySettingsScreen();
    screen2.fromSaveData(saved);
    expect(screen2.cvdMode).toBe('tritanopia');
    expect(screen2.uiScalePct).toBe(80);
    expect(screen2.snapToleranceLevel).toBe('assisted');
  });

  test('fromSaveData(null) uses defaults', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.fromSaveData(null);
    expect(screen.cvdMode).toBeNull();
    expect(screen.uiScalePct).toBe(UI_SCALE_DEFAULT);
    expect(screen.snapToleranceLevel).toBe('standard');
  });

  test('fromSaveData({}) uses defaults (pre-feature save compat)', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.fromSaveData({});
    expect(screen.cvdMode).toBeNull();
    expect(screen.uiScalePct).toBe(UI_SCALE_DEFAULT);
    expect(screen.snapToleranceLevel).toBe('standard');
  });

  test('fromSaveData with full profile dict (accessibility sub-key)', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.fromSaveData({
      player_name: 'Alice',
      accessibility: {
        cvd_mode: 'protanopia',
        ui_scale: 120,
        snap_tolerance_level: 'standard',
      },
    });
    expect(screen.cvdMode).toBe('protanopia');
    expect(screen.uiScalePct).toBe(120);
  });

  test('AC4 full scenario: deuteranopia + 130% + High Assist → restored', () => {
    const screen1 = new AccessibilitySettingsScreen();
    screen1.setCvdMode('deuteranopia');
    screen1.setUiScale(130);
    screen1.setSnapToleranceLevel('high_assist');

    const screen2 = new AccessibilitySettingsScreen();
    screen2.fromSaveData(screen1.toSaveData());
    expect(screen2.cvdMode).toBe('deuteranopia');
    expect(screen2.uiScalePct).toBe(130);
    expect(screen2.snapToleranceLevel).toBe('high_assist');
  });
});

// ============================================================================
// AC5 — Default (no CVD mode) — baseline unchanged
// ============================================================================

describe('AC5 — Baseline unchanged when no CVD mode active', () => {
  test('default cvdMode is null', () => {
    const screen = new AccessibilitySettingsScreen();
    expect(screen.cvdMode).toBeNull();
  });

  test('CvdPaletteManager(null) is not active', () => {
    const mgr = new CvdPaletteManager(null);
    expect(mgr.isActive).toBe(false);
  });

  test('CvdPaletteManager(null).remapHex returns input unchanged', () => {
    const mgr = new CvdPaletteManager(null);
    expect(mgr.remapHex('#ef5350')).toBe('#ef5350');
    expect(mgr.remapHex('#66bb6a')).toBe('#66bb6a');
    expect(mgr.remapHex('#4fc3f7')).toBe('#4fc3f7');
  });

  test('CvdPaletteManager(null).remapStateVisuals returns colors unchanged', () => {
    const mgr = new CvdPaletteManager(null);
    const visuals = {
      3: { color: '#ef5350' },
      4: { color: '#66bb6a' },
    };
    const result = mgr.remapStateVisuals(visuals);
    expect(result[3].color).toBe('#ef5350');
    expect(result[4].color).toBe('#66bb6a');
  });

  test('buildCvdPaletteManager() with null mode returns inactive manager', () => {
    const screen = new AccessibilitySettingsScreen();
    const mgr = screen.buildCvdPaletteManager();
    expect(mgr.isActive).toBe(false);
    expect(mgr.mode).toBeNull();
  });

  test('resetToDefaults() restores all settings to baseline', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setCvdMode('protanopia');
    screen.setUiScale(120);
    screen.setSnapToleranceLevel('assisted');
    screen.resetToDefaults();
    expect(screen.cvdMode).toBeNull();
    expect(screen.uiScalePct).toBe(UI_SCALE_DEFAULT);
    expect(screen.snapToleranceLevel).toBe('standard');
  });

  test('onChange callback fires on each setting change', () => {
    const events = [];
    const screen = new AccessibilitySettingsScreen({ onChange: (e) => events.push(e) });
    screen.setCvdMode('deuteranopia');
    screen.setUiScale(130);
    screen.setSnapToleranceLevel('high_assist');
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('cvd_mode');
    expect(events[1].type).toBe('ui_scale');
    expect(events[2].type).toBe('snap_tolerance');
  });

  test('buildUiScaleManager() returns manager with current scale', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setUiScale(130);
    const mgr = screen.buildUiScaleManager();
    expect(mgr.scalePct).toBe(130);
  });

  test('getSettings() returns snapshot of all current settings', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setCvdMode('deuteranopia');
    const s = screen.getSettings();
    expect(s.cvdMode).toBe('deuteranopia');
    expect(s.uiScalePct).toBe(UI_SCALE_DEFAULT);
    expect(s.snapToleranceLevel).toBe('standard');
  });
});

// ============================================================================
// Accessibility Settings Screen — entry point accessible from main menu
// ============================================================================

describe('Accessibility Settings — accessible from main menu (constraint)', () => {
  test('AccessibilitySettingsScreen can be constructed standalone (main-menu context)', () => {
    // The screen must be constructable outside of a game session context
    // so players can configure before their first play session.
    expect(() => new AccessibilitySettingsScreen()).not.toThrow();
  });

  test('all three feature areas are present (cvdMode, uiScalePct, snapToleranceLevel)', () => {
    const screen = new AccessibilitySettingsScreen();
    const settings = screen.getSettings();
    expect(settings).toHaveProperty('cvdMode');
    expect(settings).toHaveProperty('uiScalePct');
    expect(settings).toHaveProperty('snapToleranceLevel');
  });

  test('resetToDefaults provides default/reset option', () => {
    const screen = new AccessibilitySettingsScreen();
    screen.setCvdMode('protanopia');
    screen.resetToDefaults();
    expect(screen.cvdMode).toBeNull();
  });
});
