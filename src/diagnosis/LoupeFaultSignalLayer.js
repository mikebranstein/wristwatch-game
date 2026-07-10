/**
 * LoupeFaultSignalLayer — fault-signal overlay logic for the loupe viewport.
 *
 * Issue #117 — Scaffolded Fault-Signal System, Phase 1: Loupe Visual Cues
 *
 * ARCHITECTURE CONTRACT:
 *   This layer is ONLY invoked from LoupeViewport.  No other tool viewport
 *   (timing machine, pressure test, manual observation) should import or call
 *   this module.  Enforcement is architectural: other viewport modules do not
 *   depend on this file.
 *
 * AC1: Returns the correct signal variant for abnormal/damaged components.
 * AC2: Only reachable via LoupeViewport — other viewports never invoke this.
 * Design mitigation: uses an explicit allowlist — null result for healthy/unknown
 *   components prevents false signals on healthy parts.
 * Multiple-fault safety: each call is scoped to a single componentId; no shared
 *   state between components (AC7 — multi-fault scenario).
 */

const { getSignalVariant } = require('./FaultSignalConfig');

class LoupeFaultSignalLayer {
  /**
   * Returns the visual signal config for a component viewed through the loupe.
   *
   * Returns null when:
   *   - faultTypeId is null/undefined/empty (healthy component — no false signal)
   *   - faultTypeId is not in the allowlist (unrecognised fault type)
   *
   * @param {string} componentId   Unique identifier for this component
   * @param {string|null} faultTypeId  Fault type from component's fault-type attribute
   * @returns {{ componentId: string, variant: string, description: string }|null}
   */
  getSignalForComponent(componentId, faultTypeId) {
    if (!faultTypeId) return null;

    const signalConfig = getSignalVariant(faultTypeId);
    if (!signalConfig) return null;

    return {
      componentId,
      variant: signalConfig.variant,
      description: signalConfig.description,
    };
  }
}

module.exports = { LoupeFaultSignalLayer };