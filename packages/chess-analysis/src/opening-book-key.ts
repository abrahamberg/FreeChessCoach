import { Chess } from 'chess.js';

/**
 * Returns the EPD-compatible position key used by the opening-book index.
 * Halfmove and fullmove clocks are not part of a position's identity, and an
 * en-passant square is retained only when the side to move has a legal
 * en-passant capture.
 */
export function positionKey(fullFen: string): string {
  const [placement, sideToMove, castling, rawEpSquare] = fullFen.split(' ');
  const epSquare = rawEpSquare && hasLegalEnPassantCapture(fullFen, rawEpSquare)
    ? rawEpSquare
    : '-';

  return [placement, sideToMove, castling, epSquare].join(' ');
}

function hasLegalEnPassantCapture(fullFen: string, epSquare: string): boolean {
  if (!epSquare || epSquare === '-') return false;

  return new Chess(fullFen)
    .moves({ verbose: true })
    .some((move) => move.flags.includes('e'));
}
