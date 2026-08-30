import { describe, expect, test } from 'vitest';
import { moveFlags } from './move-flags.js';

describe('moveFlags', () => {
  test('describes a quiet pawn move and counts legal moves before it', () => {
    expect(moveFlags('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4')).toEqual({
      isCapture: false,
      isCheck: false,
      isCheckmate: false,
      isPromotion: false,
      isCastle: false,
      movedPieceType: 'p',
      capturedPieceType: null,
      legalMoveCount: 20
    });
  });

  test('identifies capture, check, promotion, and castling moves', () => {
    expect(moveFlags('4k3/8/3p4/4P3/8/8/8/4K3 w - - 0 1', 'exd6')).toMatchObject({
      isCapture: true,
      capturedPieceType: 'p',
      movedPieceType: 'p'
    });
    expect(moveFlags('7k/8/8/8/8/8/7R/K7 w - - 0 1', 'Rh7+')).toMatchObject({ isCheck: true, isCheckmate: false });
    expect(moveFlags('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=Q+')).toMatchObject({
      isPromotion: true,
      movedPieceType: 'p'
    });
    expect(moveFlags('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')).toMatchObject({ isCastle: true });
  });

  test('flags a checkmating move', () => {
    expect(moveFlags('7k/6pp/8/8/8/8/8/R3K3 w - - 0 1', 'Ra8#')).toMatchObject({ isCheck: true, isCheckmate: true });
  });
});
