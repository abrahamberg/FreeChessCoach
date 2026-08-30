import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { isGreatMove, type MoveClassificationInput } from './classify-great.js';

function evalAt(lines: EngineEval['lines']): EngineEval {
  return { ply: 1, fen: 'start', depth: 16, lines };
}

function candidate(overrides: Partial<MoveClassificationInput> = {}): MoveClassificationInput {
  return {
    ply: 1,
    moveSan: 'e4',
    moveUci: 'e2e4',
    mover: 'white',
    fenBefore: '8/8/8/8/8/8/4P3/4K2k w - - 0 1',
    fenAfter: '8/8/8/8/4P3/8/8/4K2k b - - 0 1',
    evalBefore: evalAt([
      { moveUci: 'e2e4', moveSan: 'e4', cp: 500, mateIn: null },
      { moveUci: 'e2e3', moveSan: 'e3', cp: -500, mateIn: null }
    ]),
    evalAfter: evalAt([{ moveUci: 'e2e4', moveSan: 'e4', cp: 500, mateIn: null }]),
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
    beforeWin: 70,
    afterWin: 86,
    drop: 0,
    cpBefore: 500,
    cpAfter: 500,
    isBookMove: false,
    ...overrides
  };
}

describe('isGreatMove', () => {
  test('accepts a unique best move that improves the result band', () => {
    expect(isGreatMove(candidate())).toBe(true);
  });

  test('requires MultiPV data for uniqueness', () => {
    expect(isGreatMove(candidate({ evalBefore: evalAt([{ moveUci: 'e2e4', moveSan: 'e4', cp: 500, mateIn: null }]) }))).toBe(false);
  });

  test('does not label an ordinary best move great without materiality', () => {
    expect(isGreatMove(candidate({
      beforeWin: 50,
      afterWin: 51,
      drop: 0,
      evalBefore: evalAt([
        { moveUci: 'e2e4', moveSan: 'e4', cp: 50, mateIn: null },
        { moveUci: 'e2e3', moveSan: 'e3', cp: -50, mateIn: null }
      ])
    }))).toBe(false);
  });
});
