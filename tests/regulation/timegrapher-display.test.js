/**
 * Tests: TimegrapherDisplay — visual readout with target zone indicator.
 * Issue #294 — Movement Regulation Phase 1
 *
 * Covers:
 *   AC1 — Timegrapher display is visible; shows deviation and regulator state in real time
 *   AC3 — Visual target range indicator ON by default; Acceptable zone highlighted
 *   Test Scenario 5 — Visual indicator OFF: live reading still shown; tooltip available
 *
 * Run with: npm test
 */
'use strict';

const { TimegrapherDisplay } = require('../../src/regulation/TimegrapherDisplay');
const { GRADES, GRADE_THRESHOLDS } = require('../../src/regulation/RegulationConfig');

function makeDisplay(opts = {}) {
  const renders = [];
  const renderFn = (vm) => renders.push(vm);
  const display = new TimegrapherDisplay({ renderFn, ...opts });
  return { display, renders };
}

describe('TimegrapherDisplay', () => {
  describe('constructor', () => {
    it('requires renderFn', () => {
      expect(() => new TimegrapherDisplay({ renderFn: 'not a function' }))
        .toThrow('TimegrapherDisplay requires a renderFn function.');
    });

    it('AC3: visual indicator is ON by default', () => {
      const { display } = makeDisplay();
      expect(display.isVisualIndicatorOn()).toBe(true);
    });

    it('accepts visualIndicatorOn: false override', () => {
      const { display } = makeDisplay({ visualIndicatorOn: false });
      expect(display.isVisualIndicatorOn()).toBe(false);
    });
  });

  describe('render() — AC1: live readout', () => {
    it('calls renderFn with deviation label in real time', () => {
      const { display, renders } = makeDisplay();
      display.render(60, null, 50, 'neutral');
      expect(renders).toHaveLength(1);
      expect(renders[0].deviation).toBe(60);
      expect(renders[0].deviationLabel).toBe('+60.0 s/day');
    });

    it('includes negative deviation label correctly', () => {
      const { display, renders } = makeDisplay();
      display.render(-25, GRADES.ACCEPTABLE, 40, 'retard');
      expect(renders[0].deviation).toBe(-25);
      expect(renders[0].deviationLabel).toBe('-25.0 s/day');
    });

    it('AC1: includes regulator index and direction label', () => {
      const { display, renders } = makeDisplay();
      display.render(30, GRADES.ACCEPTABLE, 42, 'retard');
      expect(renders[0].regulatorIndex).toBe(42);
      expect(renders[0].directionLabel).toBe('retard');
    });

    it('AC1: isPassing is true when grade is not null', () => {
      const { display, renders } = makeDisplay();
      display.render(20, GRADES.GOOD, 50, 'neutral');
      expect(renders[0].isPassing).toBe(true);
    });

    it('AC1: isPassing is false when grade is null (outside Acceptable)', () => {
      const { display, renders } = makeDisplay();
      display.render(60, null, 50, 'neutral');
      expect(renders[0].isPassing).toBe(false);
    });
  });

  describe('render() — AC3: visual indicator ON (default)', () => {
    it('acceptableZone.highlighted is true when indicator is ON', () => {
      const { display, renders } = makeDisplay();
      display.render(60, null, 50, 'neutral');
      expect(renders[0].visualIndicatorOn).toBe(true);
      expect(renders[0].acceptableZone.highlighted).toBe(true);
    });

    it('acceptableZone.label is set when indicator is ON', () => {
      const { display, renders } = makeDisplay();
      display.render(60, null, 50, 'neutral');
      const { acceptableZone } = renders[0];
      expect(acceptableZone.label).toContain(`±${GRADE_THRESHOLDS[GRADES.ACCEPTABLE]}`);
    });

    it('acceptableZone.threshold matches ACCEPTABLE grade threshold', () => {
      const { display, renders } = makeDisplay();
      display.render(60, null, 50, 'neutral');
      expect(renders[0].acceptableZone.threshold).toBe(GRADE_THRESHOLDS[GRADES.ACCEPTABLE]);
    });

    it('acceptableZone.inZone is true when deviation is within Acceptable band', () => {
      const { display, renders } = makeDisplay();
      display.render(20, GRADES.GOOD, 50, 'neutral');
      expect(renders[0].acceptableZone.inZone).toBe(true);
    });

    it('acceptableZone.inZone is false when deviation is outside Acceptable band', () => {
      const { display, renders } = makeDisplay();
      display.render(50, null, 50, 'neutral');
      expect(renders[0].acceptableZone.inZone).toBe(false);
    });
  });

  describe('toggleVisualIndicator() — Test Scenario 5', () => {
    it('toggles visual indicator OFF from ON', () => {
      const { display } = makeDisplay();
      const newState = display.toggleVisualIndicator();
      expect(newState).toBe(false);
      expect(display.isVisualIndicatorOn()).toBe(false);
    });

    it('toggles visual indicator back ON', () => {
      const { display } = makeDisplay();
      display.toggleVisualIndicator();
      const newState = display.toggleVisualIndicator();
      expect(newState).toBe(true);
    });

    it('Test Scenario 5: when indicator is OFF, acceptableZone.highlighted is false', () => {
      const { display, renders } = makeDisplay();
      display.toggleVisualIndicator();
      display.render(60, null, 50, 'neutral');
      expect(renders[0].acceptableZone.highlighted).toBe(false);
    });

    it('Test Scenario 5: when indicator is OFF, live deviation reading still shown', () => {
      const { display, renders } = makeDisplay();
      display.toggleVisualIndicator();
      display.render(60, null, 50, 'neutral');
      // Live readout still present
      expect(renders[0].deviation).toBe(60);
      expect(renders[0].deviationLabel).toBe('+60.0 s/day');
    });

    it('Test Scenario 5: when indicator is OFF, directional tooltip (directionLabel) still shown', () => {
      const { display, renders } = makeDisplay();
      display.toggleVisualIndicator();
      display.render(60, null, 55, 'advance');
      expect(renders[0].directionLabel).toBe('advance');
    });

    it('Test Scenario 5: when indicator OFF, label is null', () => {
      const { display, renders } = makeDisplay();
      display.toggleVisualIndicator();
      display.render(60, null, 50, 'neutral');
      expect(renders[0].acceptableZone.label).toBeNull();
    });
  });
});
