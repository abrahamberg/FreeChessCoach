import { beforeEach, describe, expect, test, vi } from 'vitest';
import { classifyTacticClaims } from '../classify-tactic-motif.js';
import { countingVerdictDeps, decideMoveVerdict } from './index.js';
import { line, ROOK_FORK_FEN, START_FEN, scenario } from './verdict-test-fixtures.js';

// A pass-through spy on the detector-registry entry point every tactic
// check goes through, including the ones inside `classifyTacticChance`.
vi.mock('../classify-tactic-motif.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../classify-tactic-motif.js')>();
  return { ...original, classifyTacticClaims: vi.fn(original.classifyTacticClaims) };
});

describe('decideMoveVerdict — the free gate', () => {
  beforeEach(() => {
    vi.mocked(classifyTacticClaims).mockClear();
  });

  test('a move that lost nothing, with nothing at stake: null, and no detector runs', () => {
    const input = scenario({
      fen: START_FEN,
      moveSan: 'd4',
      quality: 'excellent',
      before: [[['e4', 'e5'], 35], [['d4', 'd5'], 30], [['Nf3', 'Nf6'], 25]],
      after: [[['d5', 'c4'], 30]]
    });
    const { deps, counters } = countingVerdictDeps();

    expect(decideMoveVerdict(input, deps)).toBeNull();
    expect(classifyTacticClaims).not.toHaveBeenCalled();
    expect(counters.tacticChances).toBe(0);
    expect(Object.values(counters.checks).every((count) => count === 0)).toBe(true);
  });

  test('the spy sees detector runs when a check does happen', () => {
    const input = scenario({
      fen: ROOK_FORK_FEN,
      moveSan: 'Ka2',
      quality: 'blunder',
      before: [[['Nd6+', 'Kd7', 'Nxb7'], 500], [['Ka2'], -200]],
      after: [[['Kd7'], -200]]
    });

    expect(decideMoveVerdict(input)).toMatchObject({ reason: 'missedTactic' });
    expect(classifyTacticClaims).toHaveBeenCalled();
  });

  // The position after a mate has no engine lines, so the stored cpAfter is
  // 0; read as a score, that turned every delivered mate into a missed one.
  test('the move that mates is never a missed mate', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const mate = line(fen, ['Ra8#'], { mate: 1 });
    const input = scenario({ fen, moveSan: 'Kf2', quality: 'best', before: [[['Kf2'], 0]], after: [[['Kf8'], 0]] });
    const move = { ...input.move, moveSan: 'Ra8#', uci: 'a1a8', cpBefore: 1990, cpAfter: 0 };
    const evals = [
      { ply: 0, fen, depth: 18, lines: [mate, line(fen, ['Kf2'], 0)] },
      { ply: 1, fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', depth: 18, lines: [] }
    ];

    const verdict = decideMoveVerdict({ move, evals, previous: null });
    expect(verdict?.kind).not.toBe('failure');
    expect(verdict).toMatchObject({ kind: 'credit', reason: 'foundMate' });
  });
});
