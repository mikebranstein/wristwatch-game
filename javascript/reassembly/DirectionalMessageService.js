/**
 * DirectionalMessageService — retrieves part-specific directional error messages.
 *
 * Acts as the lookup layer between the AssemblyFeedbackStateMachine (State 3 trigger)
 * and the error message UI region (content replacement only — no UI redesign).
 *
 * Responsibilities:
 *   - Provides getMessage(partId) → string|null for State 3 consumption (AC1).
 *   - Validates the ≤15-word cap on all loaded messages at construction time (AC2).
 *   - Provides coverage audit helpers (getAllPartIds, hasMessage) for QA (AC1).
 *
 * The service accepts an optional messageMap override in its constructor so tests can
 * inject controlled copy without touching the production map.
 *
 * Phase 2 — Issue #78: Directional Error Messages for Assembly Failure States.
 */

const { DIRECTIONAL_MESSAGES } = require('./DirectionalMessageMap');

/** Maximum allowed word count per message (AC2). */
const MAX_WORDS = 15;

/**
 * Count words in a message string.
 * Splits on whitespace; the em dash (—) is treated as a non-word separator.
 * @param {string} message
 * @returns {number}
 */
function countWords(message) {
  // Remove em dashes and extra whitespace, then split.
  return message
    .replace(/—/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

class DirectionalMessageService {
  /**
   * @param {Object} [messageMap=DIRECTIONAL_MESSAGES] — part ID → message string.
   *   Defaults to the production DirectionalMessageMap; inject an override in tests.
   */
  constructor(messageMap = DIRECTIONAL_MESSAGES) {
    this._messages = messageMap;
    this._validateMessages();
  }

  /**
   * Validate that every message in the map is ≤ MAX_WORDS.
   * Throws on construction if any message violates the cap, surfacing copy errors early.
   * @throws {Error}
   */
  _validateMessages() {
    for (const [partId, message] of Object.entries(this._messages)) {
      const wc = countWords(message);
      if (wc > MAX_WORDS) {
        throw new Error(
          `DirectionalMessageService: message for "${partId}" exceeds ${MAX_WORDS} words ` +
          `(${wc} words): "${message}"`
        );
      }
    }
  }

  /**
   * Returns the directional message for a given part, or null if no message is defined.
   * Returning null signals the caller to suppress the message display (not show generic text).
   *
   * @param {string} partId
   * @returns {string|null}
   */
  getMessage(partId) {
    return this._messages[partId] ?? null;
  }

  /**
   * Returns true when a directional message exists for the given part ID.
   * @param {string} partId
   * @returns {boolean}
   */
  hasMessage(partId) {
    return Object.prototype.hasOwnProperty.call(this._messages, partId);
  }

  /**
   * Returns all part IDs that have a directional message defined.
   * Used by QA coverage audits (Test Scenario 3).
   * @returns {string[]}
   */
  getAllPartIds() {
    return Object.keys(this._messages);
  }
}

module.exports = { DirectionalMessageService, MAX_WORDS, countWords };
