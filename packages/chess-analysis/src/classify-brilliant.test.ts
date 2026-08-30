import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { isBrilliantMove, type MoveClassificationInput } from './classify-brilliant.js';

const BEFORE = '4k3/3p1p2/8/8/2B5/8/8/4K3 w - - 0 1';
const AFTER = '4k3/3p1p2/4B3/8/8/8/8/4K3 b - - 1 1';

function evalAt(lines: EngineEval['lines']): EngineEval {
  return { ply: 0, fen: BEFORE, depth: 16, lines };
}

function candidate(overrides: Partial<MoveClassificationInput> = {}): MoveClassificationInput {
  return {
    ply: 1,
    moveSan: 'Be6',
    moveUci: 'c4e6',
    mover: 'white',
    fenBefore: BEFORE,
    fenAfter: AFTER,
    evalBefore: evalAt([
      { moveUci: 'c4e6', moveSan: 'Be6', cp: 0, mateIn: null },
      { moveUci: 'e1d2', moveSan: 'Kd2', cp: -150, mateIn: null }
    ]),
    evalAfter: { ply: 1, fen: AFTER, depth: 16, lines: [{ moveUci: 'd7e6', moveSan: 'dxe6', cp: 0, mateIn: null }] },
    moveFlags: {
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isPromotion: false,
      isCastle: false,
      movedPieceType: 'b',
      capturedPieceType: null,
      legalMoveCount: 20
    },
    bestLinePvSan: ['Be6', 'dxe6'],
    beforeWin: 50,
    afterWin: 50,
    drop: 0,
    cpBefore: 0,
    cpAfter: 0,
    brilliantSoundness: true,
    ...overrides
  };
}

describe('isBrilliantMove', () => {
  test('accepts a sound, non-obvious sacrifice', () => {
    expect(isBrilliantMove(candidate())).toBe(true);
  });

  test('rejects a defended piece because SEE is not negative', () => {
    const defendedBefore = '4k3/4q3/8/8/2B5/8/4R3/4K3 w - - 0 1';
    const defendedAfter = '4k3/4q3/4B3/8/8/8/4R3/4K3 b - - 1 1';
    expect(isBrilliantMove(candidate({ fenBefore: defendedBefore, fenAfter: defendedAfter }))).toBe(false);
  });

  test('rejects sacrifices in a trivially winning position', () => {
    expect(isBrilliantMove(candidate({ beforeWin: 98, afterWin: 96, drop: 2 }))).toBe(false);
  });

  test('rejects a desperado in a lost position', () => {
    expect(isBrilliantMove(candidate({ beforeWin: 8, afterWin: 20, drop: 1 }))).toBe(false);
  });

  test('rejects an exchange sacrifice that immediately wins the material back', () => {
    const before = '4k3/3p1p2/8/8/2R5/8/4Q3/4K3 w - - 0 1';
    const after = '4k3/3p1p2/4R3/8/8/8/4Q3/4K3 b - - 1 1';
    expect(isBrilliantMove(candidate({
      fenBefore: before,
      fenAfter: after,
      moveSan: 'Re6',
      moveUci: 'c4e6',
      moveFlags: { ...candidate().moveFlags, movedPieceType: 'r' },
      bestLinePvSan: ['Re6', 'dxe6', 'Qxe6']
    }))).toBe(false);
  });

  test('fails closed when the targeted soundness check is missing or negative', () => {
    expect(isBrilliantMove(candidate({ brilliantSoundness: undefined }))).toBe(false);
    expect(isBrilliantMove(candidate({ brilliantSoundness: false }))).toBe(false);
  });
});
