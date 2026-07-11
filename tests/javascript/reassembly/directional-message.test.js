/**
 * Tests for DirectionalMessageMap + DirectionalMessageService — Phase 2 (Issue #78)
 *
 * Acceptance Criteria validated:
 *   AC1 — Every reassembly part has a unique directional message; zero generic fallbacks
 *   AC2 — Each message includes part name + corrective action descriptor; ≤15 words
 *   AC3 — Message retrieval is synchronous (no async delay introduced)
 *
 * Test Scenarios mapped:
 *   Scenario 2  — Wrong orientation message: getMessage returns part-specific string
 *   Scenario 3  — Part-specific coverage audit: all snap zone parts have a message
 *   Scenario 4  — Message length audit: all messages ≤15 words
 *   Scenario 5  — Directional accuracy: each message contains the part name or a descriptor
 */

const { DIRECTIONAL_MESSAGES } = require('../../../src/reassembly/DirectionalMessageMap');
const {
  DirectionalMessageService,
  MAX_WORDS,
  countWords,
} = require('../../../src/reassembly/DirectionalMessageService');
const { SNAP_ZONES } = require('../../../src/reassembly/SnapZoneTolerance');

// ─────────────────────────────────────────────────────────────────────────────
// AC1: Part coverage audit
// ─────────────────────────────────────────────────────────────────────────────

describe('AC1 — DirectionalMessageMap: part coverage audit (Test Scenario 3)', () => {
  test('every part in SNAP_ZONES has an entry in DIRECTIONAL_MESSAGES', () => {
    const snapParts = Object.keys(SNAP_ZONES);
    const messageParts = Object.keys(DIRECTIONAL_MESSAGES);

    snapParts.forEach((partId) => {
      expect(messageParts).toContain(partId);
    });
  });

  test('all directional messages are unique (no two parts share the same copy)', () => {
    const messages = Object.values(DIRECTIONAL_MESSAGES);
    const uniqueMessages = new Set(messages);
    expect(uniqueMessages.size).toBe(messages.length);
  });

  test('DIRECTIONAL_MESSAGES has no undefined or empty-string entries', () => {
    Object.entries(DIRECTIONAL_MESSAGES).forEach(([partId, msg]) => {
      expect(typeof msg).toBe('string');
      expect(msg.trim().length).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2: Word count audit — all messages ≤15 words (Test Scenario 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC2 — Message length audit: all messages ≤15 words (Test Scenario 4)', () => {
  Object.entries(DIRECTIONAL_MESSAGES).forEach(([partId, message]) => {
    test(`"${partId}" message is ≤${MAX_WORDS} words`, () => {
      const wc = countWords(message);
      expect(wc).toBeLessThanOrEqual(MAX_WORDS);
    });
  });

  test('countWords correctly excludes em dashes from word count', () => {
    expect(countWords('Dial upside down — rotate 180° so the 12 faces the crown.')).toBeLessThanOrEqual(MAX_WORDS);
  });

  test('countWords returns correct count for a known sentence', () => {
    // "Mainspring wound backwards release tension and rewind clockwise" = 8 content words
    const wc = countWords('Mainspring wound backwards — release tension and rewind clockwise.');
    expect(wc).toBe(8);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC2 continued: part name in message (corrective action descriptor check)
// ─────────────────────────────────────────────────────────────────────────────

describe('AC2 — Part name or descriptor present in each directional message', () => {
  // For each part, the message must contain a recognizable reference to the part.
  // We check for the first significant word of the part ID (e.g. "balance" for balance_wheel).
  const partKeywords = {
    mainspring:    'mainspring',
    barrel:        'barrel',
    barrel_bridge: 'barrel bridge',
    escape_wheel:  'escape wheel',
    pallet_fork:   'pallet fork',
    balance_wheel: 'balance wheel',
    balance_cock:  'balance cock',
    cannon_pinion: 'cannon pinion',
    minute_wheel:  'minute wheel',
    hour_wheel:    'hour wheel',
    dial:          'dial',
    crown:         'crown',
    stem:          'stem',
  };

  Object.entries(partKeywords).forEach(([partId, keyword]) => {
    test(`"${partId}" message contains "${keyword}"`, () => {
      const msg = DIRECTIONAL_MESSAGES[partId];
      expect(msg.toLowerCase()).toContain(keyword.toLowerCase());
    });
  });

  // Each message must contain at least one corrective action keyword
  const corrective = ['rotate', 'flip', 'align', 'slide', 'push', 'remove', 'rewind', 'turn'];
  Object.entries(DIRECTIONAL_MESSAGES).forEach(([partId, message]) => {
    test(`"${partId}" message contains a corrective action descriptor`, () => {
      const lower = message.toLowerCase();
      const hasAction = corrective.some((kw) => lower.includes(kw));
      expect(hasAction).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DirectionalMessageService unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe('DirectionalMessageService — getMessage()', () => {
  let svc;
  beforeEach(() => { svc = new DirectionalMessageService(); });

  test('getMessage returns the directional message string for a known part', () => {
    expect(typeof svc.getMessage('balance_cock')).toBe('string');
    expect(svc.getMessage('balance_cock').length).toBeGreaterThan(0);
  });

  test('getMessage returns null for an unknown part (AC1: no generic fallback)', () => {
    expect(svc.getMessage('unknown_part_xyz')).toBeNull();
  });

  test('getMessage is synchronous — returns immediately without async', () => {
    // Synchronous calls have no .then; assert the return is not a Promise
    const result = svc.getMessage('dial');
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('string');
  });
});

describe('DirectionalMessageService — hasMessage()', () => {
  let svc;
  beforeEach(() => { svc = new DirectionalMessageService(); });

  test('hasMessage returns true for all parts in SNAP_ZONES', () => {
    Object.keys(SNAP_ZONES).forEach((partId) => {
      expect(svc.hasMessage(partId)).toBe(true);
    });
  });

  test('hasMessage returns false for an unknown part', () => {
    expect(svc.hasMessage('phantom_gear')).toBe(false);
  });
});

describe('DirectionalMessageService — getAllPartIds()', () => {
  let svc;
  beforeEach(() => { svc = new DirectionalMessageService(); });

  test('getAllPartIds returns an array of strings', () => {
    const ids = svc.getAllPartIds();
    expect(Array.isArray(ids)).toBe(true);
    ids.forEach((id) => expect(typeof id).toBe('string'));
  });

  test('getAllPartIds includes all SNAP_ZONES parts', () => {
    const ids = svc.getAllPartIds();
    Object.keys(SNAP_ZONES).forEach((partId) => {
      expect(ids).toContain(partId);
    });
  });
});

describe('DirectionalMessageService — word-cap validation at construction', () => {
  test('throws on construction when a message exceeds MAX_WORDS', () => {
    const tooLong = {
      bad_part: 'This is a message that is definitely way too long to be accepted by the service.',
    };
    expect(() => new DirectionalMessageService(tooLong)).toThrow(/exceeds/i);
  });

  test('does NOT throw when messages are exactly MAX_WORDS', () => {
    // 15 one-character words separated by spaces
    const words = Array.from({ length: MAX_WORDS }, () => 'a').join(' ');
    const valid = { good_part: words };
    expect(() => new DirectionalMessageService(valid)).not.toThrow();
  });

  test('production DIRECTIONAL_MESSAGES passes word-cap validation on construction', () => {
    expect(() => new DirectionalMessageService()).not.toThrow();
  });
});
