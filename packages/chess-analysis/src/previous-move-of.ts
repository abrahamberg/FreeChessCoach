import { Chess, type Square } from 'chess.js';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { PreviousMove } from './tactic-detectors/context.js';

/**
 * The opponent's move immediately before `ply`, in the shape the tactic
 * detectors want.
 *
 * A FEN cannot tell a recapture apart from a piece left hanging — the two
 * positions are identical — and that one distinction accounts for most of
 * the false tactics `docs/tactics-rework.md` §2 measured. The report pipeline
 * has the whole move list, so it can simply say.
 *
 * `uci` is optional on a stored move, so the move is replayed from its own
 * `fenBefore` when it's missing. Returns `null` at the first ply, or when
 * the previous move can't be replayed — the detectors treat that as "not
 * known", never as "not a recapture".
 */
export function previousMoveOf(moves: readonly ClassifiedMoveDto[], ply: number): PreviousMove | null {
  const previous = moves.find((move) => move.ply === ply - 1);
  if (!previous) return null;

  if (previous.uci && previous.uci.length >= 4) {
    return {
      from: previous.uci.slice(0, 2) as Square,
      to: previous.uci.slice(2, 4) as Square,
      wasCapture: capturedOn(previous)
    };
  }
  if (!previous.fenBefore) return null;

  try {
    const board = new Chess(previous.fenBefore);
    const move = board.move(previous.moveSan);
    if (!move) return null;
    return { from: move.from as Square, to: move.to as Square, wasCapture: move.captured !== undefined };
  } catch {
    return null;
  }
}

/** `moveFlags.isCapture` when the pipeline computed it; otherwise the SAN's
 * own `x`, which is what SAN uses for a capture and nothing else. */
function capturedOn(move: ClassifiedMoveDto): boolean {
  return move.moveFlags?.isCapture ?? move.moveSan.includes('x');
}
