import { Chess, type Color, type Move, type Square } from 'chess.js';
import { buildAttackMap, opponentOf, type AttackMap } from '../attack-map.js';
import { flipActiveColorFen } from '../null-move-fen.js';

function toColor(mover: 'white' | 'black'): Color {
  return mover === 'white' ? 'w' : 'b';
}

/**
 * The opponent's previous move, when the caller knows it.
 *
 * A recapture is the most ordinary move in chess and is almost never a
 * tactic — `docs/tactics-rework.md` §2 measured 97 of 113 of them carrying a
 * label — but a FEN alone cannot tell one apart from a piece being left
 * hanging, because the two positions are identical. This is the one piece of
 * history the detectors need, and every real caller has it: the report
 * pipeline walks the game move by move.
 *
 * `null` when the caller doesn't know (a puzzle FEN with no preceding move,
 * or the first ply of a game). Detectors must degrade rather than assume:
 * an unknown previous move is not evidence that the move isn't a recapture.
 */
export interface PreviousMove {
  from: Square;
  to: Square;
  wasCapture: boolean;
}

/**
 * Everything a registry detector might need, computed once per candidate
 * move instead of each detector re-replaying it.
 *
 * Layer 1 of `docs/tactics-rework.md` §5: detectors propose `TacticClaim[]`
 * from this, move-scoped — a claim's actor has to be a piece this move put
 * to work, never any piece on the board that happens to fit the shape.
 */
export interface TacticDetectionContext {
  fenBefore: string;
  moveSan: string;
  mover: Color;
  opponent: Color;
  before: Chess;
  beforeAttackMap: AttackMap;
  /** null when `moveSan` doesn't apply legally from `fenBefore`. */
  after: Chess | null;
  afterAttackMap: AttackMap | null;
  /** The replayed move itself — `from`/`captured`/`promotion`/flags, so a
   * detector never re-derives what chess.js already told us. `null`
   * alongside `after`. */
  move: Move | null;
  destination: Square | null;
  previous: PreviousMove | null;
  /** `fenBefore` with the opponent to move — the null-move position that
   * answers "what could they have done if I had passed?". Every defensive
   * motif is that question: a move breaks a pin only if the pin was there
   * before it. `null` when the mover is in check, where passing is illegal
   * and the question has no sound answer (see `flipActiveColorFen`). */
  beforeNullMove: Chess | null;
}

export function buildTacticDetectionContext(
  fenBefore: string,
  moveSan: string,
  mover: 'white' | 'black',
  previous: PreviousMove | null = null
): TacticDetectionContext {
  const before = new Chess(fenBefore);
  const beforeAttackMap = buildAttackMap(before);
  const moverColor = toColor(mover);

  const after = new Chess(fenBefore);
  let move: Move | null = null;
  try {
    move = after.move(moveSan) ?? null;
  } catch {
    move = null;
  }

  const nullMoveFen = flipActiveColorFen(fenBefore);

  return {
    fenBefore,
    moveSan,
    mover: moverColor,
    opponent: opponentOf(moverColor),
    before,
    beforeAttackMap,
    after: move ? after : null,
    afterAttackMap: move ? buildAttackMap(after) : null,
    move,
    destination: move ? (move.to as Square) : null,
    previous,
    beforeNullMove: nullMoveFen ? new Chess(nullMoveFen) : null
  };
}

/** True when this move recaptures on the square the opponent just captured
 * on — restoring material rather than winning it. Unknown history reads as
 * "not a recapture", which is the conservative answer for the detectors that
 * over-propose and the honest one for the gates that reject. */
export function isRecapture(context: TacticDetectionContext): boolean {
  const previous = context.previous;
  if (!previous || !previous.wasCapture || !context.move) return false;
  return context.move.captured !== undefined && context.move.to === previous.to;
}
