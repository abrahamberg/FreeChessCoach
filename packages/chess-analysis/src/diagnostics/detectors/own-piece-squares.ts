import type { PlyDiagnosticContext } from '../context.js';
import { loosePieces, type LoosePiece } from '../../board-facts/loose-pieces.js';

export type LooseTiers = readonly LoosePiece['tier'][];

/** `free` only: a piece the opponent can take with nothing defending it. */
export const FREE: LooseTiers = ['free'];
/** Everything the opponent could win: free, or defended but losing the exchange. */
export const FREE_OR_WINNABLE: LooseTiers = ['free', 'winnable'];

/** The squares of `mover`'s own loose pieces in `fen`, by `loosePieces`. */
export function looseSquares(fen: string, mover: PlyDiagnosticContext['mover'], tiers: LooseTiers): string[] {
  return loosePieces(fen, mover === 'white' ? 'w' : 'b')
    .filter((piece) => tiers.includes(piece.tier))
    .map((piece) => piece.square);
}
