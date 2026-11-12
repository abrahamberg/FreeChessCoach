import { positionKey } from '../opening-book-key.js';

/** A position still to search, and every index of the game that holds it. */
export interface PendingPosition {
  /** The fen sent to the engine: the first pending occurrence's. */
  fen: string;
  /** Every pending index holding this position (Task 77.2): a repetition is
   * searched once and its eval fanned back out to each index. */
  occurrences: { index: number; fen: string }[];
}

/** The positions of `fens` whose index is not in `known`, one entry per
 * distinct `positionKey` (placement, side to move, castling, en passant), in
 * order of first occurrence. */
export function pendingPositions(known: ReadonlyMap<number, unknown>, fens: readonly string[]): PendingPosition[] {
  const byKey = new Map<string, PendingPosition>();
  fens.forEach((fen, index) => {
    if (known.has(index)) return;
    const key = positionKey(fen);
    const existing = byKey.get(key);
    if (existing) existing.occurrences.push({ index, fen });
    else byKey.set(key, { fen, occurrences: [{ index, fen }] });
  });
  return [...byKey.values()];
}
