'use strict';

const { WatchIntake } = require('../../../javascript/intake/WatchIntake');

describe('WatchIntake.captureBeforePortraitUrl — Issue #129', () => {
  test('returns watchId and before_portrait_url when a URL is provided', () => {
    const intake = new WatchIntake();

    expect(intake.captureBeforePortraitUrl('watch-123', 'portraits/watch-123-before.png')).toEqual({
      watchId: 'watch-123',
      before_portrait_url: 'portraits/watch-123-before.png',
    });
  });

  test.each([null, '', undefined])('returns null before_portrait_url when given %p', (value) => {
    const intake = new WatchIntake();

    expect(intake.captureBeforePortraitUrl('watch-123', value)).toEqual({
      watchId: 'watch-123',
      before_portrait_url: null,
    });
  });

  test('does not affect existing assignDamageState behaviour', () => {
    const intake = new WatchIntake({ intakeRate: 1.0, weights: { water_ingress: 1, oxidation: 0, crystal_crazing: 0 } }, () => 0);

    intake.captureBeforePortraitUrl('watch-123', 'portraits/watch-123-before.png');

    expect(intake.assignDamageState()).toBe('water_ingress');
  });
});
