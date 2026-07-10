/**
 * ReassemblyMicroConfirmationController — Phase 2 full rollout. Issue #123.
 *
 * Phase 2 removes the A/B cohort gate and the prototype-only restriction introduced
 * in Phase 1 (Issue #122). Micro-confirmation feedback (audio click + visual highlight
 * + analytics) now fires unconditionally for ALL correctly seated reassembly components
 * and for ALL players.
 *
 * The cohort-tracking fields (_cohort, startSession) are retained for backward
 * compatibility and for abandonment-rate analytics (AC5), but they no longer gate
 * the per-seating feedback path.
 */
const PROTOTYPE_COMPONENT_ID = 'balance_wheel';
const COHORTS = { FEEDBACK_ON: 'feedback-on', CONTROL: 'control' };
const DEFAULT_HIGHLIGHT_DURATION_MS = 1000;
const AUDIO_CUE = 'sfx_reassembly_confirmation_click';

class ReassemblyMicroConfirmationController {
  constructor({
    telemetry, playAudio, renderHighlight,
    isMuted = () => false,
    prototypeComponentId = PROTOTYPE_COMPONENT_ID,
    highlightDurationMs = DEFAULT_HIGHLIGHT_DURATION_MS,
    randomFn = Math.random,
    setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  }) {
    if (!telemetry || typeof telemetry.reassemblyComponentSeatedSuccess !== 'function' ||
        typeof telemetry.reassemblySessionAbandoned !== 'function') {
      throw new Error('Requires TelemetryEmitter with reassemblyComponentSeatedSuccess() + reassemblySessionAbandoned().');
    }
    if (typeof playAudio !== 'function') throw new Error('playAudio must be a function.');
    if (typeof renderHighlight !== 'function') throw new Error('renderHighlight must be a function.');
    this._telemetry = telemetry;
    this._playAudio = playAudio;
    this._renderHighlight = renderHighlight;
    this._isMuted = isMuted;
    this._prototypeComponentId = prototypeComponentId;
    this._highlightDurationMs = highlightDurationMs;
    this._randomFn = randomFn;
    this._setTimeoutFn = setTimeoutFn;
    this._cohort = null;
    this._sessionActive = false;
    this._abandoned = false;
    this._seatedPartIds = new Set();
  }

  startSession() {
    // Cohort assignment is retained for abandonment analytics (AC5) but no longer
    // gates per-seating feedback. Phase 2: all players receive feedback unconditionally.
    this._cohort = this._randomFn() < 0.5 ? COHORTS.FEEDBACK_ON : COHORTS.CONTROL;
    this._sessionActive = true;
    this._abandoned = false;
    this._seatedPartIds.clear();
    return this._cohort;
  }

  /**
   * Phase 2: fires for ALL components regardless of cohort or component type.
   * Phase 1 gates (prototype-only, feedback-ON cohort) have been removed.
   */
  onComponentSeated(partId) {
    if (!this._sessionActive) return;
    if (this._seatedPartIds.has(partId)) return;
    this._seatedPartIds.add(partId);
    this._telemetry.reassemblyComponentSeatedSuccess(partId, this._cohort);
    if (!this._isMuted()) this._playAudio(AUDIO_CUE);
    this._renderHighlight({ partId, active: true });
    this._setTimeoutFn(() => this._renderHighlight({ partId, active: false }), this._highlightDurationMs);
  }

  onComponentUnseated(partId) { this._seatedPartIds.delete(partId); }

  onSessionAbandoned() {
    if (!this._sessionActive) return;
    if (this._abandoned) return;
    this._abandoned = true;
    this._sessionActive = false;
    this._telemetry.reassemblySessionAbandoned(this._cohort);
  }

  getCohort() { return this._cohort; }
  isSessionActive() { return this._sessionActive; }
  getPrototypeComponentId() { return this._prototypeComponentId; }
}

module.exports = { ReassemblyMicroConfirmationController, PROTOTYPE_COMPONENT_ID, COHORTS, AUDIO_CUE, DEFAULT_HIGHLIGHT_DURATION_MS };
