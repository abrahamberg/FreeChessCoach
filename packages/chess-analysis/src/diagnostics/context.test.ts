import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { analyzeChecksCapturesThreats } from '../checks-captures-threats.js';
import { buildPlyDiagnosticContext } from './context.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function baseMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'e4',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'best',
    bestLineSan: ['e4'],
    evalAfterCp: 20,
    hangsPiece: false,
    fenBefore: START_FEN,
    fenAfter: AFTER_E4_FEN,
    ...overrides
  };
}

describe('buildPlyDiagnosticContext', () => {
  test('returns null when fenAfter is missing (legacy stored analysis)', () => {
    expect(buildPlyDiagnosticContext(baseMove({ fenAfter: undefined }))).toBeNull();
  });

  test('returns null when fenBefore is missing', () => {
    expect(buildPlyDiagnosticContext(baseMove({ fenBefore: undefined }))).toBeNull();
  });

  test('computes opponentChecksCapturesThreats on fenAfter, not fenBefore', () => {
    const context = buildPlyDiagnosticContext(baseMove());

    expect(context).not.toBeNull();
    expect(context!.opponentChecksCapturesThreats).toEqual(analyzeChecksCapturesThreats(AFTER_E4_FEN));
    expect(context!.opponentChecksCapturesThreats).not.toEqual(analyzeChecksCapturesThreats(START_FEN));
  });

  test('leaves moveTime undefined when no clock entry matches this ply', () => {
    const context = buildPlyDiagnosticContext(baseMove());

    expect(context!.moveTime).toBeUndefined();
  });

  test('attaches this ply\'s clock reading from moveTimes when one is present', () => {
    const context = buildPlyDiagnosticContext(baseMove(), {
      moveTimes: [
        { ply: 1, clockMs: 598000, evalCp: 20, timeSpentMs: 2000 },
        { ply: 2, clockMs: 597000, evalCp: 18, timeSpentMs: 3000 }
      ]
    });

    expect(context!.moveTime).toEqual({ ply: 1, clockMs: 598000, evalCp: 20, timeSpentMs: 2000 });
  });

  test('passes optional analysis fields through unchanged', () => {
    const context = buildPlyDiagnosticContext(
      baseMove({ isTacticalPosition: true, bestMoveSan: 'e4', bestLinePvSan: ['e4', 'e5'], drop: 12.5 })
    );

    expect(context!.isTacticalPosition).toBe(true);
    expect(context!.bestMoveSan).toBe('e4');
    expect(context!.bestLinePvSan).toEqual(['e4', 'e5']);
    expect(context!.drop).toBe(12.5);
  });

  test('leaves previousMove/nextMoves undefined when not supplied, attaches them when supplied', () => {
    const withoutNeighbors = buildPlyDiagnosticContext(baseMove());
    expect(withoutNeighbors!.previousMove).toBeUndefined();
    expect(withoutNeighbors!.nextMoves).toBeUndefined();

    const previousMove = baseMove({ ply: 0, moveSan: 'd4' });
    const nextMove = baseMove({ ply: 2, moveSan: 'e5' });
    const withNeighbors = buildPlyDiagnosticContext(baseMove(), { previousMove, nextMoves: [nextMove] });

    expect(withNeighbors!.previousMove).toBe(previousMove);
    expect(withNeighbors!.nextMoves).toEqual([nextMove]);
  });

  test('leaves tacticDiagnostic/tacticRankHits undefined when not supplied, attaches them when supplied', () => {
    const withoutTactics = buildPlyDiagnosticContext(baseMove());
    expect(withoutTactics!.tacticDiagnostic).toBeUndefined();
    expect(withoutTactics!.tacticRankHits).toBeUndefined();

    const tacticDiagnostic = { type: 'fork' as const, failed: true, detail: 'missed Nd6+' };
    const tacticRankHits = [{ ply: 1, motif: 'fork' as const, rank: 1, playedRank: 1 }];
    const withTactics = buildPlyDiagnosticContext(baseMove(), { tacticDiagnostic, tacticRankHits });

    expect(withTactics!.tacticDiagnostic).toBe(tacticDiagnostic);
    expect(withTactics!.tacticRankHits).toBe(tacticRankHits);
  });

  test('carries the stored evals and the best-vs-played gap', () => {
    const context = buildPlyDiagnosticContext(
      baseMove({ cpBefore: 30, cpAfter: -300, winPctBefore: 52.8, winPctAfter: 24.9 })
    );

    expect(context!.cpBefore).toBe(30);
    expect(context!.cpAfter).toBe(-300);
    expect(context!.winPctBefore).toBe(52.8);
    expect(context!.winPctAfter).toBe(24.9);
    expect(context!.playedGap?.meaningful).toBe(true);
  });

  test('leaves playedGap null on a legacy move without cpBefore/cpAfter', () => {
    expect(buildPlyDiagnosticContext(baseMove())!.playedGap).toBeNull();
  });

  test('takes the refutation from the very next ply only', () => {
    const reply = baseMove({ ply: 2, moveSan: 'e5', mover: 'black', bestLinePvSan: ['d5', 'exd5'] });
    const withReply = buildPlyDiagnosticContext(baseMove(), { nextMoves: [reply] });
    const withLaterPly = buildPlyDiagnosticContext(baseMove(), { nextMoves: [{ ...reply, ply: 3 }] });

    expect(withReply!.refutationPvSan).toEqual(['d5', 'exd5']);
    expect(withLaterPly!.refutationPvSan).toBeUndefined();
    expect(buildPlyDiagnosticContext(baseMove())!.refutationPvSan).toBeUndefined();
  });
});
