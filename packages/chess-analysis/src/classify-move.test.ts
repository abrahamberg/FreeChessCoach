import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { classifyMove, type MoveClassificationInput } from './classify-move.js';

function input(overrides: Partial<MoveClassificationInput> = {}): MoveClassificationInput {
  const evalBefore: EngineEval = {
    ply: 0,
    fen: 'start',
    depth: 16,
    lines: [
      { moveUci: 'e2e4', moveSan: 'e4', cp: 0, mateIn: null },
      { moveUci: 'd2d4', moveSan: 'd4', cp: -100, mateIn: null }
    ]
  };
  return {
    ply: 1,
    moveSan: 'e4',
    moveUci: 'e2e4',
    mover: 'white',
    fenBefore: '8/8/8/8/8/8/4P3/4K2k w - - 0 1',
    fenAfter: '8/8/8/8/4P3/8/8/4K2k b - - 0 1',
    evalBefore,
    evalAfter: { ...evalBefore, ply: 1, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 0, mateIn: null }] },
    moveFlags: {
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isPromotion: false,
      isCastle: false,
      movedPieceType: 'p',
      capturedPieceType: null,
      legalMoveCount: 2
    },
    beforeWin: 50,
    afterWin: 50,
    drop: 0,
    cpBefore: 0,
    cpAfter: 0,
    isBookMove: false,
    ...overrides
  };
}

describe('classifyMove', () => {
  test('honors the decision order for book, forced, and best', () => {
    expect(classifyMove(input({ isBookMove: true, moveFlags: { ...input().moveFlags, legalMoveCount: 1 }, drop: 30 }))).toEqual({ classification: 'book' });
    expect(classifyMove(input({ moveFlags: { ...input().moveFlags, legalMoveCount: 1 }, drop: 30 }))).toEqual({ classification: 'forced' });
    expect(classifyMove(input())).toEqual({ classification: 'best' });
  });

  test('uses the damped severity and miss re-label after best-move checks', () => {
    expect(classifyMove(input({ moveSan: 'e3', drop: 20, beforeWin: 99, afterWin: 94 }))).toEqual({ classification: 'inaccuracy' });
    expect(classifyMove(input({
      moveSan: 'e3',
      drop: 15,
      beforeWin: 80,
      afterWin: 60,
      evalBefore: { ...input().evalBefore, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 900, mateIn: null }, { moveUci: 'd2d4', moveSan: 'd4', cp: 100, mateIn: null }] },
      evalAfter: { ...input().evalAfter, lines: [{ moveUci: 'e2e3', moveSan: 'e3', cp: 0, mateIn: null }] }
    }))).toEqual({ classification: 'miss', underlyingSeverity: 'mistake' });
  });

  // Task 125.3: 22…Qc3 gave up a forced mate, stayed at -13.9, and wore "excellent".
  describe('a move that gives up a short forced mate is a miss, whatever it kept', () => {
    const mateBefore = (mateIn: number): EngineEval => ({ ...input().evalBefore, depth: 12, lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: null, mateIn }, { moveUci: 'd2d4', moveSan: 'd4', cp: 900, mateIn: null }] });
    const after = (line: { cp: number | null; mateIn: number | null }): EngineEval => ({ ...input().evalAfter, lines: [{ moveUci: 'a7a6', moveSan: 'a6', ...line }] });
    const played = { moveSan: 'd4', drop: 0, beforeWin: 100, afterWin: 100 };

    test('a mate the review would count (mate in 2 at depth 12), and none after', () => {
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(2), evalAfter: after({ cp: 900, mateIn: null }) }))).toEqual({ classification: 'miss', underlyingSeverity: 'excellent' });
    });

    test('a slower mate is still a mate: no miss', () => {
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(2), evalAfter: after({ cp: null, mateIn: 4 }) }))).toEqual({ classification: 'excellent' });
    });

    test('a long mate, or one this search cannot stand behind, is not held against the move', () => {
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(9), evalAfter: after({ cp: 900, mateIn: null }) }))).toEqual({ classification: 'excellent' });
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(5), evalAfter: after({ cp: 900, mateIn: null }) }))).toEqual({ classification: 'excellent' });
    });

    test('nothing is said of a position after that was not searched', () => {
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(2), evalAfter: { ...input().evalAfter, lines: [] } }))).toEqual({ classification: 'excellent' });
    });

    test('another mate in one is no miss', () => {
      const mated = { ...input().moveFlags, isCheckmate: true, isCheck: true };
      expect(classifyMove(input({ ...played, moveFlags: mated, evalBefore: mateBefore(1), evalAfter: after({ cp: null, mateIn: 0 }) }))).toEqual({ classification: 'excellent' });
    });

    test('the other side\'s mate is no opportunity', () => {
      expect(classifyMove(input({ ...played, evalBefore: mateBefore(-2), evalAfter: after({ cp: null, mateIn: -1 }), beforeWin: 0, afterWin: 0 }))).toEqual({ classification: 'excellent' });
    });
  });
});
