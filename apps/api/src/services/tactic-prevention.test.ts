import type { ClassifiedMoveDto, EngineEval, PositionAnalysis, PositionAnalysisLine } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { computeTacticMotifPrevented } from './tactic-prevention.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const FORK_FEN_BLACK_TO_MOVE = '4k3/1r6/8/8/2N5/8/8/K7 b - - 0 1';
const ROOK_MOVED_AWAY_FEN = '4k3/8/8/8/2N5/8/8/K7 w - - 0 1';

// Two-motif fixtures (mirrors packages/chess-analysis's
// tactic-prevention-check.test.ts): white has both a fork (Nd6+, forking the
// king on e8 and the rook on b7) and a free undefended pawn (Qxd3)
// available. Moving the rook to d8 answers both at once — the knight check
// then has only the king to hit, and the rook guards d3 down the open file.
const TWO_MOTIF_FEN = '4k3/1r6/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_DEFUSED_FEN = '3rk3/8/8/8/2N5/3p4/8/3Q3K w - - 0 1';
const TWO_MOTIF_LINES: PositionAnalysisLine[] = [
  { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null },
  { moveUci: 'd1d3', moveSan: 'Qxd3', pvSan: ['Qxd3'], cp: 300, mateIn: null }
];

/** The verified payoff behind a Nd6+ fork card: the rook on b7. Cards carry
 * it so the sentence can say what the threat would have won rather than
 * naming the motif alone. */
const FORK_GAIN = { kind: 'material', pawns: 5, prize: 'rook' } as const;

// Typed as the richer PositionAnalysisLine (always-present pvSan) so the
// same fixtures work both as EngineEval.lines (EngineLine's pvSan is
// optional — a superset accepts this) and as PositionAnalysis.lines.
const FORK_LINE: PositionAnalysisLine = { moveUci: 'c4d6', moveSan: 'Nd6+', pvSan: ['Nd6+'], cp: 500, mateIn: null };
const QUIET_LINE: PositionAnalysisLine = { moveUci: 'a1b1', moveSan: 'Kb1', pvSan: ['Kb1'], cp: 0, mateIn: null };

// Nd6+'s own board geometry (tacticHitVisual) — the knight on d6 forking e8 and b7.
const FORK_VISUAL = {
  arrows: [
    { from: 'd6', to: 'e8' },
    { from: 'd6', to: 'b7' }
  ],
  highlights: []
};

function move(overrides: Partial<ClassifiedMoveDto> & { ply: number; mover: 'white' | 'black' }): ClassifiedMoveDto {
  return {
    moveSan: 'e4',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

function evalAt(fen: string, ply: number, lines: PositionAnalysisLine[]): EngineEval {
  return { ply, fen, depth: 12, lines };
}

function analysisFixture(fen: string, lines: PositionAnalysis['lines']): PositionAnalysis {
  return {
    fen,
    depth: 12,
    multiPv: lines.length,
    bestMove: lines[0]?.moveSan ?? '',
    eval: { cp: 0, mateIn: null },
    lines,
    features: {} as PositionAnalysis['features']
  };
}

describe('computeTacticMotifPrevented', () => {
  test('Free path hit: reuses prior.fenBefore and move.fenAfter\'s own evals, zero engine calls', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [FORK_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(ROOK_MOVED_AWAY_FEN, 2, [FORK_LINE])];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.counts.black.preventable.fork).toBe(1);
    expect(result.counts.black.prevented.fork).toBe(1);
    expect(result.byPly.get(2)).toEqual({
      type: 'fork',
      prevented: true,
      detail: 'knight on d6 forks e8 and b7',
      visual: FORK_VISUAL,
      gain: FORK_GAIN
    });
    expect(result.diagnosticByPly.get(2)).toEqual({ type: 'fork', failed: false, detail: 'knight on d6 forks e8 and b7', visual: FORK_VISUAL });
  });

  // Task 50.4: byPly/counts stay biased on purpose (see the function's doc
  // comment) — this is the diagnostic denominator's whole reason to exist.
  test('a best-or-better reply that defused the threat still records an unbiased diagnostic opportunity, even though counts.preventable stays untouched', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        quality: 'best',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [FORK_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(ROOK_MOVED_AWAY_FEN, 2, [FORK_LINE])];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.counts.black).toEqual({ preventable: {}, prevented: {} });
    expect(result.byPly.size).toBe(0);
    expect(result.diagnosticByPly.get(2)).toEqual({ type: 'fork', failed: false, detail: 'knight on d6 forks e8 and b7', visual: FORK_VISUAL });
  });

  // Task 50.4: a BEST_OR_BETTER ply never pays for the gated engine
  // fallback, so a tactically-sharp one whose free path misses simply gets
  // no diagnostic opportunity recorded — see the function's doc comment.
  test('a best-or-better reply never triggers the gated fallback, even for diagnostics', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        quality: 'best',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: true
      })
    ];
    // The free path misses: prior's own last-turn eval has nothing.
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [QUIET_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(ROOK_MOVED_AWAY_FEN, 2, [FORK_LINE])];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.diagnosticByPly.size).toBe(0);
  });

  test('Free path miss + non-tactical position: no engine call, no prevention claimed', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: FORK_FEN_BLACK_TO_MOVE,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [QUIET_LINE])];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.counts.black).toEqual({ preventable: {}, prevented: {} });
    expect(result.byPly.size).toBe(0);
  });

  test('Free path miss + tactical position: exactly one extra engine call, hit recorded', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rb7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: ROOK_MOVED_AWAY_FEN,
        isTacticalPosition: true
      })
    ];
    // The free path misses: prior's own last-turn eval has nothing.
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [QUIET_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(ROOK_MOVED_AWAY_FEN, 2, [FORK_LINE])];
    const threatAnalysis = analysisFixture(FORK_FEN, [FORK_LINE]);
    const analyzePosition = vi.fn().mockResolvedValue(threatAnalysis);

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).toHaveBeenCalledTimes(1);
    expect(analyzePosition).toHaveBeenCalledWith(FORK_FEN);
    expect(result.counts.black.preventable.fork).toBe(1);
    expect(result.counts.black.prevented.fork).toBe(1);
  });

  test('a move defusing two distinct motif types increments both counters (free path)', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Kh1', fenBefore: TWO_MOTIF_FEN, fenAfter: TWO_MOTIF_FEN }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Rd8',
        fenBefore: TWO_MOTIF_FEN,
        fenAfter: TWO_MOTIF_DEFUSED_FEN,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [
      evalAt(TWO_MOTIF_FEN, 0, TWO_MOTIF_LINES),
      evalAt(TWO_MOTIF_FEN, 1, []),
      evalAt(TWO_MOTIF_DEFUSED_FEN, 2, TWO_MOTIF_LINES)
    ];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.counts.black.preventable.fork).toBe(1);
    expect(result.counts.black.preventable.freePiece).toBe(1);
    expect(result.counts.black.prevented.fork).toBe(1);
    expect(result.counts.black.prevented.freePiece).toBe(1);
    // fork outranks freePiece in TACTIC_MOTIF_TYPES order (mirrors the
    // detectors' own precedence), so it's the one named on this ply.
    expect(result.byPly.get(2)).toEqual({
      type: 'fork',
      prevented: true,
      detail: 'knight on d6 forks e8 and b7',
      visual: FORK_VISUAL,
      gain: FORK_GAIN
    });
  });

  test('ply-1 move (no prior opponent turn) is skipped cleanly, no throw', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'e4', fenBefore: FORK_FEN_BLACK_TO_MOVE, fenAfter: FORK_FEN_BLACK_TO_MOVE, isTacticalPosition: true })
    ];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, []);

    expect(analyzePosition).not.toHaveBeenCalled();
    expect(result.counts).toEqual({
      white: { preventable: {}, prevented: {} },
      black: { preventable: {}, prevented: {} }
    });
    expect(result.byPly.size).toBe(0);
  });

  test('a threat that is faced but not defused counts toward preventable without incrementing prevented', async () => {
    const allMoves = [
      move({ ply: 1, mover: 'white', moveSan: 'Nc4', fenBefore: FORK_FEN, fenAfter: FORK_FEN_BLACK_TO_MOVE }),
      move({
        ply: 2,
        mover: 'black',
        moveSan: 'Kd7',
        fenBefore: FORK_FEN_BLACK_TO_MOVE,
        fenAfter: FORK_FEN,
        isTacticalPosition: false
      })
    ];
    const evals: EngineEval[] = [evalAt(FORK_FEN, 0, [FORK_LINE]), evalAt(FORK_FEN_BLACK_TO_MOVE, 1, []), evalAt(FORK_FEN, 2, [FORK_LINE])];
    const analyzePosition = vi.fn();

    const result = await computeTacticMotifPrevented({ analyzePosition }, allMoves, evals);

    expect(result.counts.black.preventable.fork).toBe(1);
    expect(result.counts.black.prevented.fork).toBeUndefined();
    expect(result.byPly.get(2)).toEqual({
      type: 'fork',
      prevented: false,
      detail: 'knight on d6 forks e8 and b7',
      visual: FORK_VISUAL,
      gain: FORK_GAIN
    });
    expect(result.diagnosticByPly.get(2)).toEqual({ type: 'fork', failed: true, detail: 'knight on d6 forks e8 and b7', visual: FORK_VISUAL });
  });
});
