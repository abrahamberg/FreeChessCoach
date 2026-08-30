import { TACTIC_MOTIF_TYPES, type ClassifiedMoveDto, type EngineEval, type TacticMotifCounts } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { computeTacticMotifCounts, computeTacticMotifPlayed, computeTacticMotifRankHits } from './game-tactic-motifs.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
/** White to move; the fork/pin fixtures used elsewhere (classify-tactic-motif.test.ts's
 * FORK_FEN/PIN_FEN) share the e8 king as their common anchor, so both
 * patterns coexist here: Ne4-d6+ forks king e8 + rook b7 (fork's knight
 * moved to e4 instead of c4 so it doesn't block the bishop's own diagonal);
 * Bd3-b5 pins knight c6 to king e8; Ka1-b1 is a quiet third option. */
const MULTI_MOTIF_FEN = '4k3/1r6/2n5/8/4N3/3B4/8/K7 w - - 0 1';

function evalAt(ply: number, bestMoveUci: string, bestMoveSan: string): EngineEval {
  return { ply, fen: FORK_FEN, depth: 16, lines: [{ moveUci: bestMoveUci, moveSan: bestMoveSan, cp: 500, mateIn: null }] };
}

function baseMove(overrides: Partial<ClassifiedMoveDto> & Pick<ClassifiedMoveDto, 'ply' | 'moveSan' | 'quality'>): ClassifiedMoveDto {
  return {
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    fenBefore: FORK_FEN,
    isTacticalPosition: true,
    ...overrides
  };
}

describe('computeTacticMotifCounts', () => {
  test('credits both an opportunity and a find when the player plays the best move', () => {
    const move = baseMove({
      ply: 1,
      moveSan: 'Nd6+',
      quality: 'best',
      moveFlags: {
        isCapture: false,
        isCheck: true,
        isCheckmate: false,
        isPromotion: false,
        isCastle: false,
        movedPieceType: 'n',
        capturedPieceType: null,
        legalMoveCount: 10
      }
    });
    const counts = computeTacticMotifCounts([move], [evalAt(1, 'c4d6', 'Nd6+')]);

    expect(counts.fork).toEqual({ opportunities: 1, found: 1 });
    expect(counts.checkmate).toEqual({ opportunities: 0, found: 0 });
  });

  test('credits only an opportunity when the player misses the best move', () => {
    const move = baseMove({ ply: 1, moveSan: 'Kb1', quality: 'good' });
    const counts = computeTacticMotifCounts([move], [evalAt(1, 'c4d6', 'Nd6+')]);

    expect(counts.fork).toEqual({ opportunities: 1, found: 0 });
  });

  test('skips a move with no stored fenBefore or no best-line move', () => {
    const noFenBefore = baseMove({ ply: 1, moveSan: 'Kb1', quality: 'good', fenBefore: undefined });
    const noBestLine = baseMove({ ply: 2, moveSan: 'Kb1', quality: 'good' });

    const counts = computeTacticMotifCounts(
      [noFenBefore, noBestLine],
      [evalAt(1, 'c4d6', 'Nd6+'), { ply: 2, fen: FORK_FEN, depth: 16, lines: [] }]
    );

    expect(counts.fork).toEqual({ opportunities: 0, found: 0 });
  });
});

describe('computeTacticMotifPlayed', () => {
  test('counts a played tactic even when it was not the engine\'s #1 line', () => {
    const move = baseMove({
      ply: 1,
      moveSan: 'Nd6+',
      quality: 'good',
      moveFlags: {
        isCapture: false,
        isCheck: true,
        isCheckmate: false,
        isPromotion: false,
        isCastle: false,
        movedPieceType: 'n',
        capturedPieceType: null,
        legalMoveCount: 10
      }
    });
    const evalWithDifferentBest: EngineEval = {
      ply: 1,
      fen: FORK_FEN,
      depth: 16,
      lines: [{ moveUci: 'a1b1', moveSan: 'Kb1', cp: 0, mateIn: null }]
    };

    const played = computeTacticMotifPlayed([move], [evalWithDifferentBest]);

    expect(played.fork).toBe(1);
  });

  test('a quiet, non-tactical move contributes nothing', () => {
    const quietFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const move = baseMove({ ply: 1, moveSan: 'e4', quality: 'good', fenBefore: quietFen, isTacticalPosition: false });
    const quietEval: EngineEval = {
      ply: 1,
      fen: quietFen,
      depth: 16,
      lines: [
        { moveUci: 'e2e4', moveSan: 'e4', cp: 25, mateIn: null },
        { moveUci: 'd2d4', moveSan: 'd4', cp: 22, mateIn: null }
      ]
    };

    const played = computeTacticMotifPlayed([move], [quietEval]);

    expect(played).toEqual({});
  });

  test('skips a move with no stored fenBefore, without throwing', () => {
    const move = baseMove({ ply: 1, moveSan: 'Nd6+', quality: 'good', fenBefore: undefined });

    expect(() => computeTacticMotifPlayed([move], [evalAt(1, 'c4d6', 'Nd6+')])).not.toThrow();
    expect(computeTacticMotifPlayed([move], [evalAt(1, 'c4d6', 'Nd6+')])).toEqual({});
  });

  test('tallies multiple occurrences of the same motif across the game', () => {
    const first = baseMove({ ply: 1, moveSan: 'Nd6+', quality: 'good' });
    const second = baseMove({ ply: 3, moveSan: 'Nd6+', quality: 'good' });

    const played = computeTacticMotifPlayed([first, second], [evalAt(1, 'c4d6', 'Nd6+'), evalAt(3, 'c4d6', 'Nd6+')]);

    expect(played.fork).toBe(2);
  });
});

describe('computeTacticMotifRankHits', () => {
  function multiMotifEval(): EngineEval {
    return {
      ply: 1,
      fen: MULTI_MOTIF_FEN,
      depth: 16,
      lines: [
        { moveUci: 'a1b1', moveSan: 'Kb1', cp: 0, mateIn: null },
        { moveUci: 'e4d6', moveSan: 'Nd6+', cp: 500, mateIn: null },
        { moveUci: 'd3b5', moveSan: 'Bb5', cp: 200, mateIn: null }
      ]
    };
  }

  test('tags every top-N line with a motif, marking which rank the player actually played', () => {
    const move = baseMove({ ply: 1, moveSan: 'Bb5', quality: 'best', fenBefore: MULTI_MOTIF_FEN });

    const hits = computeTacticMotifRankHits([move], [multiMotifEval()], 3);

    expect(hits).toEqual([
      { ply: 1, motif: 'fork', rank: 1, playedRank: null },
      { ply: 1, motif: 'pin', rank: 2, playedRank: 2 }
    ]);
  });

  test('a smaller topN omits lines beyond it', () => {
    const move = baseMove({ ply: 1, moveSan: 'Bb5', quality: 'best', fenBefore: MULTI_MOTIF_FEN });

    const hits = computeTacticMotifRankHits([move], [multiMotifEval()], 2);

    expect(hits).toEqual([{ ply: 1, motif: 'fork', rank: 1, playedRank: null }]);
  });

  test('is a strict superset of computeTacticMotifCounts: aggregating rank-0 hits reproduces it exactly', () => {
    const playedBest = baseMove({
      ply: 1,
      moveSan: 'Nd6+',
      quality: 'best',
      moveFlags: {
        isCapture: false,
        isCheck: true,
        isCheckmate: false,
        isPromotion: false,
        isCastle: false,
        movedPieceType: 'n',
        capturedPieceType: null,
        legalMoveCount: 10
      }
    });
    const missedBest = baseMove({ ply: 2, moveSan: 'Kb1', quality: 'good', fenBefore: FORK_FEN });
    const evals = [evalAt(1, 'c4d6', 'Nd6+'), { ...evalAt(1, 'c4d6', 'Nd6+'), ply: 2 }];

    const counts = computeTacticMotifCounts([playedBest, missedBest], evals);
    const rankZeroCounts = aggregateRankZero(computeTacticMotifRankHits([playedBest, missedBest], evals, 1), [playedBest, missedBest]);

    expect(rankZeroCounts).toEqual(counts);
  });
});

function emptyCounts(): TacticMotifCounts {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as TacticMotifCounts;
}

/** computeTacticMotifCounts's "found" also requires the player's OWN move
 * quality be best-or-better, not merely that they played the top-ranked
 * line — this mirrors that same rule when reducing rank-0 hits down to the
 * simpler opportunities/found shape. */
function aggregateRankZero(hits: ReturnType<typeof computeTacticMotifRankHits>, moves: ClassifiedMoveDto[]): TacticMotifCounts {
  const counts = emptyCounts();
  const qualityByPly = new Map(moves.map((move) => [move.ply, move.quality]));
  const BEST_OR_BETTER = new Set(['brilliant', 'great', 'best']);

  for (const hit of hits) {
    if (hit.rank !== 0) continue;
    counts[hit.motif].opportunities += 1;
    if (hit.playedRank === 0 && BEST_OR_BETTER.has(qualityByPly.get(hit.ply) ?? '')) counts[hit.motif].found += 1;
  }
  return counts;
}
