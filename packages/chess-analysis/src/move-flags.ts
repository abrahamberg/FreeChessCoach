import { Chess } from 'chess.js';
import type { MoveFlagsDto } from '@freechesscoach/shared';

export type MoveFlags = MoveFlagsDto;

/** Derives the classification flags for one legal move without an engine call. */
export function moveFlags(fenBefore: string, moveSan: string): MoveFlags {
  const chess = new Chess(fenBefore);
  const legalMoveCount = chess.moves().length;
  const move = chess.move(moveSan);

  return {
    isCapture: move.captured !== undefined,
    isCheck: move.san.endsWith('+') || move.san.endsWith('#'),
    isCheckmate: move.san.endsWith('#'),
    isPromotion: move.isPromotion(),
    isCastle: move.isKingsideCastle() || move.isQueensideCastle(),
    movedPieceType: move.piece,
    capturedPieceType: move.captured ?? null,
    legalMoveCount
  };
}
