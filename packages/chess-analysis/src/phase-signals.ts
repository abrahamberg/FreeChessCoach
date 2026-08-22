import { Chess, type PieceSymbol } from 'chess.js';

const NON_PAWN_MATERIAL: Record<Exclude<PieceSymbol, 'p' | 'k'>, number> = {
  n: 3,
  b: 3,
  r: 5,
  q: 9
};

const PHASE_UNITS: Record<Exclude<PieceSymbol, 'p' | 'k'>, number> = {
  n: 1,
  b: 1,
  r: 2,
  q: 4
};

export interface NonPawnMaterial {
  white: number;
  black: number;
}

/** Counts conventional non-pawn material points for each side. */
export function nonPawnMaterial(fen: string): NonPawnMaterial {
  return countMaterial(fen, NON_PAWN_MATERIAL);
}

/** Counts the phase units used by the report's endgame boundary. */
export function phaseUnits(fen: string): number {
  const material = countMaterial(fen, PHASE_UNITS);
  return material.white + material.black;
}

function countMaterial(
  fen: string,
  values: Record<Exclude<PieceSymbol, 'p' | 'k'>, number>
): NonPawnMaterial {
  const counts: NonPawnMaterial = { white: 0, black: 0 };
  for (const piece of new Chess(fen).board().flat()) {
    if (piece === null || piece.type === 'p' || piece.type === 'k') continue;
    counts[piece.color === 'w' ? 'white' : 'black'] += values[piece.type];
  }
  return counts;
}
