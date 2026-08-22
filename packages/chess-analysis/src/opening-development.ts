import { Chess } from 'chess.js';
import type { ParsedPosition } from './pgn.js';

export type DevelopmentColor = 'white' | 'black';

const FILES = 'abcdefgh';
const HOME_SQUARES: Record<DevelopmentColor, Record<'b' | 'n', ReadonlySet<string>>> = {
  white: {
    b: new Set(['c1', 'f1']),
    n: new Set(['b1', 'g1'])
  },
  black: {
    b: new Set(['c8', 'f8']),
    n: new Set(['b8', 'g8'])
  }
};

/** Returns the ply on which the given side first castled, or null otherwise. */
export function castledPly(
  positions: readonly ParsedPosition[],
  color: DevelopmentColor
): number | null {
  const castlingPosition = positions.find(
    (position) => position.mover === color && isCastlingSan(position.moveSan)
  );
  return castlingPosition?.ply ?? null;
}

/** Counts knights and bishops that are no longer on their original home squares. */
export function developedMinorPieceCount(fen: string, color: DevelopmentColor): number {
  const board = new Chess(fen).board();
  const homeSquares = HOME_SQUARES[color];
  let developedCount = 0;

  for (const [rankIndex, row] of board.entries()) {
    for (const [fileIndex, piece] of row.entries()) {
      if (!piece || piece.color !== toChessColor(color) || !isMinorPiece(piece.type)) continue;

      const file = FILES[fileIndex];
      if (!file) continue;
      const square = `${file}${8 - rankIndex}`;
      if (!homeSquares[piece.type].has(square)) developedCount += 1;
    }
  }

  return developedCount;
}

function isCastlingSan(moveSan: string | null): boolean {
  if (!moveSan) return false;
  const normalized = moveSan.replaceAll('0', 'O');
  return /^O-O(?:-O)?[+#]?$/.test(normalized);
}

function isMinorPiece(pieceType: string): pieceType is 'b' | 'n' {
  return pieceType === 'b' || pieceType === 'n';
}

function toChessColor(color: DevelopmentColor): 'w' | 'b' {
  return color === 'white' ? 'w' : 'b';
}
