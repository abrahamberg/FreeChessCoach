import type { EngineEval } from '@chess-coach/shared';
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
});
