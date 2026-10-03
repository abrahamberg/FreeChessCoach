import { Chess, type Move } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { flipActiveColorFen } from './null-move-fen.js';
import { positionKey } from './opening-book-key.js';
import type { ParsedPosition } from './pgn.js';

/**
 * The pass scan: the engine's eval of a position with the side to move
 * *passing*, i.e. the position after a move with the turn handed back to the
 * mover (`flipActiveColorFen`). It answers what no other scan can: whether
 * the side that now has to move is hurt by the *obligation to move* (zugzwang)
 * rather than by the mover's threats, which a pass would not cure.
 *
 * It is a second engine request, so it is planned once for the whole game and
 * shared. A consumer does not ask for its own scan: it adds a `PassScanWant`
 * to `PASS_SCAN_WANTS`, and every ply any want accepts has its flipped
 * position put on one list, de-duplicated by `positionKey` (two wants on the
 * same ply, or a repeated position, cost one search). The registry is in
 * `pass-scan-wants.ts`. The result is read back
 * by position with `passEvalOf`, never by consumer, so a later tactic that
 * wants the same ply finds the eval already there.
 */

/** One move as a want sees it. */
export interface PassScanPly {
  /** The game's ply index (the position after the move). */
  ply: number;
  fenBefore: string;
  fenAfter: string;
  move: Move;
  /** The position after the move. */
  after: Chess;
}

/** A consumer's reason to want the pass scan of the position after a move.
 * Keep `wants` cheap and static (board facts only): it runs on every ply of
 * every game, and each ply it accepts costs an engine search. */
export interface PassScanWant {
  id: string;
  wants(ply: PassScanPly): boolean;
}

/** The flipped positions to scan for a game, one per distinct position, in
 * game order. Plies whose position cannot be flipped (the side to move is in
 * check) never appear: there is no pass to evaluate. */
export function planPassScans(positions: readonly ParsedPosition[], wants: readonly PassScanWant[]): string[] {
  const planned = new Map<string, string>();
  for (const position of positions) {
    const ply = plyOf(positions, position);
    if (!ply || !wants.some((want) => want.wants(ply))) continue;
    const flipped = flipActiveColorFen(ply.fenAfter);
    if (flipped && !planned.has(positionKey(flipped))) planned.set(positionKey(flipped), flipped);
  }
  return [...planned.values()];
}

function plyOf(positions: readonly ParsedPosition[], position: ParsedPosition): PassScanPly | null {
  const before = positions[position.ply - 1];
  if (!before || !position.moveUci) return null;
  const chess = new Chess(before.fen);
  let move: Move;
  try {
    move = chess.move({ from: position.moveUci.slice(0, 2), to: position.moveUci.slice(2, 4), promotion: position.moveUci.slice(4) || undefined });
  } catch {
    return null;
  }
  return { ply: position.ply, fenBefore: before.fen, fenAfter: position.fen, move, after: chess };
}

/** Pass evals by the flipped position's `positionKey`. */
export type PassEvals = ReadonlyMap<string, EngineEval>;

/** The pass evals among `evals` (the ones for `passFens`, in any order). */
export function indexPassEvals(evals: readonly EngineEval[]): PassEvals {
  return new Map(evals.map((evalResult) => [positionKey(evalResult.fen), evalResult]));
}

/** The pass eval of the position after a move, if it was scanned. */
export function passEvalOf(fenAfter: string, passEvals: PassEvals): EngineEval | null {
  const flipped = flipActiveColorFen(fenAfter);
  return flipped ? (passEvals.get(positionKey(flipped)) ?? null) : null;
}
