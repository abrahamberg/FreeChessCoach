import { describe, expect, test } from 'vitest';
import { DIAGNOSIS_CODES_BY_ID, MISTAKE_CATEGORIES } from '@freechesscoach/shared';
import {
  MISTAKE_CATEGORIES_BLOCK,
  relativeDate,
  renderCoachingPlanBlock,
  renderFocusAreasBlock,
  renderRecentFindingsBlock,
  renderScopedDiagnosisCodes,
  describeMoveRef,
  renderThreadsBlock
} from './render.js';
import type { DiagnosisCodeId, Thread } from '@freechesscoach/shared';

describe('MISTAKE_CATEGORIES_BLOCK', () => {
  test('contains all 13 categories, comma-separated', () => {
    for (const category of MISTAKE_CATEGORIES) {
      expect(MISTAKE_CATEGORIES_BLOCK).toContain(category);
    }
    expect(MISTAKE_CATEGORIES_BLOCK).toBe(MISTAKE_CATEGORIES.join(', '));
  });
});

describe('relativeDate', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  test('today', () => {
    expect(relativeDate(new Date('2026-07-28T01:00:00Z'), now)).toBe('today');
  });
  test('yesterday', () => {
    expect(relativeDate(new Date('2026-07-27T01:00:00Z'), now)).toBe('yesterday');
  });
  test('N days ago', () => {
    expect(relativeDate(new Date('2026-07-23T01:00:00Z'), now)).toBe('5 days ago');
  });
  test('N weeks ago', () => {
    expect(relativeDate(new Date('2026-07-10T01:00:00Z'), now)).toBe('2 weeks ago');
  });
  test('N months ago', () => {
    expect(relativeDate(new Date('2026-04-28T01:00:00Z'), now)).toBe('3 months ago');
  });
});

describe('renderFocusAreasBlock', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  test('renders the "(none yet…)" fallback for an empty list', () => {
    expect(renderFocusAreasBlock([], now)).toBe(
      '(none yet — this is early in your work together)'
    );
  });

  test('renders one line per focus area with status, category, note, evidence count, and relative date', () => {
    const block = renderFocusAreasBlock(
      [
        {
          category: 'king_safety',
          diagnosisCode: null,
          status: 'active',
          note: 'stops calculating after first capture',
          evidenceCount: 3,
          lastSeenAt: new Date('2026-07-27T01:00:00Z')
        }
      ],
      now
    );
    expect(block).toBe(
      '- [active] king_safety: stops calculating after first capture (seen 3x, last yesterday)'
    );
  });

  test('includes the diagnosis code in parentheses when present', () => {
    const block = renderFocusAreasBlock(
      [
        {
          category: 'missed_tactic',
          diagnosisCode: 'TA-07',
          status: 'active',
          note: 'misses knight forks',
          evidenceCount: 2,
          lastSeenAt: new Date('2026-07-27T01:00:00Z')
        }
      ],
      now
    );
    expect(block).toBe(
      '- [active] missed_tactic (TA-07): misses knight forks (seen 2x, last yesterday)'
    );
  });
});

describe('renderRecentFindingsBlock', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  test('renders a fallback for an empty list', () => {
    expect(renderRecentFindingsBlock([], now)).toContain('none yet');
  });

  test('renders one line per finding with +/- marker, category, description, relative date', () => {
    const block = renderRecentFindingsBlock(
      [
        {
          category: 'hanging_piece',
          description: 'Hung a knight on move 14 without checking captures.',
          isPositive: false,
          createdAt: new Date('2026-07-28T01:00:00Z')
        },
        {
          category: 'king_safety',
          description: 'Castled on time this game — first time in three sessions.',
          isPositive: true,
          createdAt: new Date('2026-07-21T01:00:00Z')
        }
      ],
      now
    );
    expect(block).toBe(
      '- [-] hanging_piece: Hung a knight on move 14 without checking captures. (today)\n' +
        '- [+] king_safety: Castled on time this game — first time in three sessions. (1 weeks ago)'
    );
  });
});

describe('renderCoachingPlanBlock', () => {
  test('numbers each moment with a White/Black move-pair reference (not a bare ply, which is not standard PGN terminology), kind, question, and key line', () => {
    const block = renderCoachingPlanBlock({
      gameSummary: 'summary',
      openingNote: 'opening',
      themes: ['king_safety'],
      connectionToHistory: 'connection',
      sessionGoal: 'goal',
      moments: [
        {
          ply: 23,
          kind: 'user_mistake',
          category: 'king_safety',
          whatHappened: 'Pushed g4 in front of the uncastled king.',
          socraticQuestion: 'Before pushing this pawn, where is your king going to live?',
          keyLine: 'O-O Re8 d3 h6',
          revealDepthPlies: 6
        }
      ]
    });

    expect(block).toBe(
      '1. White\'s move 12 (user_mistake): Pushed g4 in front of the uncastled king. "Before pushing this pawn, where is your king going to live?" Key line: O-O Re8 d3 h6'
    );
  });

  test("a moment at ply 24 is Black's move 12", () => {
    const block = renderCoachingPlanBlock({
      gameSummary: 'summary',
      openingNote: 'opening',
      themes: ['king_safety'],
      connectionToHistory: 'connection',
      sessionGoal: 'goal',
      moments: [
        {
          ply: 24,
          kind: 'user_mistake',
          category: 'king_safety',
          whatHappened: 'x',
          socraticQuestion: 'y',
          keyLine: 'z',
          revealDepthPlies: 6
        }
      ]
    });

    expect(block).toContain("Black's move 12");
  });
});

describe('describeMoveRef', () => {
  test('ply 0 is the game start', () => {
    expect(describeMoveRef(0)).toBe('the game start');
  });

  test('an odd ply is White\'s move', () => {
    expect(describeMoveRef(35)).toBe("White's move 18");
  });

  test('an even ply is Black\'s move', () => {
    expect(describeMoveRef(36)).toBe("Black's move 18");
  });
});

describe('renderThreadsBlock', () => {
  test('an empty ledger renders a fallback, not an empty string', () => {
    expect(renderThreadsBlock([])).toBe('(empty — no parked topics right now)');
  });

  test('renders status, topic, and hypothesis when present', () => {
    const threads: Thread[] = [
      { id: 1, topic: 'the h3 line', status: 'parked', hypothesis: null, anchorPly: null, anchorFen: null },
      {
        id: 2,
        topic: 'king safety pattern',
        status: 'active',
        hypothesis: 'stops calculating after the first capture',
        anchorPly: null,
        anchorFen: null
      }
    ];
    expect(renderThreadsBlock(threads)).toBe(
      '- [parked] the h3 line\n- [active] king safety pattern (hypothesis: stops calculating after the first capture)'
    );
  });
});

describe('renderScopedDiagnosisCodes', () => {
  const noDetectors: ReadonlySet<DiagnosisCodeId> = new Set();
  const bv01 = DIAGNOSIS_CODES_BY_ID.get('BV-01' as DiagnosisCodeId)!;
  const bv03 = DIAGNOSIS_CODES_BY_ID.get('BV-03' as DiagnosisCodeId)!;
  const rb00 = DIAGNOSIS_CODES_BY_ID.get('RB-00' as DiagnosisCodeId)!;

  test('BV-01 (detector, ratingPrior [250,1000]) is included at its lower boundary when its detector is active', () => {
    expect(bv01.ratingPrior).toEqual([250, 1000]);
    expect(bv01.detectability).toBe('detector');
    const result = renderScopedDiagnosisCodes(250, new Set(['BV-01' as DiagnosisCodeId]));
    expect(result).toContain('BV-01');
  });

  test('BV-01 is excluded just below its lower boundary, even with its detector active', () => {
    const result = renderScopedDiagnosisCodes(249, new Set(['BV-01' as DiagnosisCodeId]));
    expect(result).not.toContain('BV-01');
  });

  test('BV-01 is included at its upper boundary and excluded just above it', () => {
    expect(renderScopedDiagnosisCodes(1000, new Set(['BV-01' as DiagnosisCodeId]))).toContain('BV-01');
    expect(renderScopedDiagnosisCodes(1001, new Set(['BV-01' as DiagnosisCodeId]))).not.toContain('BV-01');
  });

  test('a detector-only code is dropped when its detector is not in the active set', () => {
    const result = renderScopedDiagnosisCodes(500, noDetectors);
    expect(result).not.toContain('BV-01');
  });

  test('a dialogue-detectable code (BV-03) is never included, even squarely inside its own ratingPrior with no detectors active', () => {
    expect(bv03.detectability).toBe('dialogue');
    expect(bv03.ratingPrior).toEqual([400, 1200]);
    const result = renderScopedDiagnosisCodes(800, noDetectors);
    expect(result).not.toContain('BV-03');
  });

  test('a dialogue-detectable code stays excluded even if its id is (incorrectly) passed as active — the catalog\'s own detectability is the actual gate, not caller discipline', () => {
    const result = renderScopedDiagnosisCodes(800, new Set(['BV-03' as DiagnosisCodeId]));
    expect(result).not.toContain('BV-03');
  });

  test('with no active detectors at all, every rating renders the empty fallback', () => {
    const result = renderScopedDiagnosisCodes(800, noDetectors);
    expect(result).toBe('(no catalog codes are scoped to this student yet — leave diagnosisCode unset and use the category list above instead)');
  });

  test('a probe-only code (RB-00) is never included, even squarely inside its own ratingPrior', () => {
    expect(rb00.detectability).toBe('probe');
    expect(rb00.ratingPrior).toEqual([100, 250]);
    const result = renderScopedDiagnosisCodes(150, noDetectors);
    expect(result).not.toContain('RB-00');
  });

  test('a rating above the whole catalog (ratingPrior maxes out at 2500) renders the empty fallback, not an empty string', () => {
    const result = renderScopedDiagnosisCodes(3000, noDetectors);
    expect(result).toBe('(no catalog codes are scoped to this student yet — leave diagnosisCode unset and use the category list above instead)');
  });

  test('each rendered line names the code id and its label', () => {
    const result = renderScopedDiagnosisCodes(250, new Set(['BV-01' as DiagnosisCodeId]));
    expect(result).toContain(`BV-01 — ${bv01.label}`);
  });
});
