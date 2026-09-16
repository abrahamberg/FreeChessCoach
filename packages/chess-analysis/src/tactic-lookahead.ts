import { Chess, type Color, type Square } from 'chess.js';
import { opponentOf } from './attack-map.js';

/**
 * The one-and-a-half-move lookahead the sacrificial motifs need.
 *
 * A decoy, an attraction sacrifice, a windmill and a mating net all have the
 * same shape: the move forces a reply, and the tactic is what the mover has
 * *after* that reply. Layer 2's static gates cannot see any of it — that is
 * precisely the family `docs/tactics-rework.md` §2 warns a safety gate
 * deletes — and line verification only helps where the pipeline has an
 * engine PV, which the puzzle fixtures and the bot's candidate scan do not.
 *
 * Everything here is bounded on purpose: the branching factor after a check
 * is tiny, and `forcedReplies` refuses to enumerate an unforced position at
 * all, so no detector can turn one move into a search.
 */

/** The number of legal replies past which a position isn't "forced" and this
 * module declines to look. A check usually leaves one to three; a quiet
 * position leaves thirty, and walking those would be a search, not a
 * lookahead. */
const FORCED_REPLY_LIMIT = 4;

export interface ForcedReply {
  san: string;
  fen: string;
  from: Square;
  /** Where the replying piece landed — a recapture's square, which is what
   * a decoy claims to have dragged something onto. */
  to: Square;
  captured: boolean;
}

/**
 * The opponent's legal replies to `fenAfter`, or `null` when there are too
 * many for the position to count as forcing.
 *
 * `null` and `[]` mean different things and callers must not conflate them:
 * `[]` is checkmate or stalemate, `null` is "this move forces nothing".
 */
export function forcedReplies(fenAfter: string): ForcedReply[] | null {
  const board = new Chess(fenAfter);
  const moves = board.moves({ verbose: true });
  if (moves.length > FORCED_REPLY_LIMIT) return null;

  return moves.map((move) => {
    const next = new Chess(fenAfter);
    next.move(move.san);
    return {
      san: move.san,
      fen: next.fen(),
      from: move.from as Square,
      to: move.to as Square,
      captured: move.captured !== undefined
    };
  });
}

/** Does the side to move at `fen` have a move that mates immediately? */
export function hasMateInOne(fen: string): boolean {
  const board = new Chess(fen);
  return board.moves().some((san) => {
    const next = new Chess(fen);
    next.move(san);
    return next.isCheckmate();
  });
}

/** Does `mover` have a check available at `fen`? `fen` must already have
 * `mover` to move. */
export function hasCheckAvailable(fen: string, mover: Color): boolean {
  const board = new Chess(fen);
  if (board.turn() !== mover) return false;
  return board.moves().some((san) => san.includes('+') || san.includes('#'));
}

/** Every square adjacent to `square`, on the board. */
export function neighboursOf(square: Square): Square[] {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const squares: Square[] = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      if (df === 0 && dr === 0) continue;
      const nextFile = file + df;
      const nextRank = rank + dr;
      if (nextFile < 0 || nextFile > 7 || nextRank < 0 || nextRank > 7) continue;
      squares.push((String.fromCharCode(97 + nextFile) + String(nextRank + 1)) as Square);
    }
  }
  return squares;
}

export { opponentOf };
