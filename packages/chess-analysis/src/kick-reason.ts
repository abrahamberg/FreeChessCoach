import { Chess, type Move } from 'chess.js';
import { occupiedSquares, opponentOf } from './attack-map.js';
import { CONFIG } from './config.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { PIECE_NAMES } from './piece-names.js';
import { see } from './see.js';
import { pins } from './tactic-pins.js';
import { PIECE_VALUES } from './tactics.js';

const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;

/**
 * A pawn move that attacks a piece, said on the move itself: "Attacks the
 * bishop on g5, which pins the knight on f6".
 *
 * 4…h6 against a bishop on g5 came back with no note: nothing is won, the
 * eval does not move, and no tactic card opens (`move-verdict/gate.ts`).
 * It is still the point of the move.
 *
 * It says what the pawn does and not what the piece must do. "It has to
 * move" was the first wording, and three golden courses turn on its being
 * false: the Fishing Pole's knight stays on g4 (…h5), the Kieninger trap
 * answers 7.a3 with …Nd3#, and the bishop in Noah's Ark has nowhere to go.
 *
 * Said only when the attack is real on the board: the piece was not already
 * attacked by a pawn, the pawn can legally take it, and the pawn is not
 * simply won where it stands.
 */
export function kickReason(fenBefore: string, moveSan: string): string | null {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  let move: Move;
  try {
    move = after.move(moveSan);
  } catch {
    return null;
  }
  // A pawn that takes is a capture first: the trade note's sentence.
  if (move.piece !== 'p' || move.promotion || move.captured) return null;

  const enemy = opponentOf(move.color);
  if (see(after.fen(), move.to, enemy) >= MIN_THREAT_SEE_CP) return null;

  const mayTake = pawnCaptures(after.fen(), move);
  const [target] = occupiedSquares(after)
    .filter((man) => man.color === enemy && man.type !== 'p' && man.type !== 'k' && mayTake.has(man.square))
    .filter((man) => !before.attackers(man.square, move.color).some((square) => before.get(square)?.type === 'p'))
    .sort((left, right) => PIECE_VALUES[right.type] - PIECE_VALUES[left.type]);
  if (!target) return null;

  // A pinned pawn is geometry more often than a bind (`verifyPin`): only a piece is named.
  const pinned = pins(after)
    .filter((hit) => hit.by === target.square)
    .flatMap((hit) => {
      const front = after.get(hit.pinned);
      return front && front.color === move.color && front.type !== 'p' ? [{ square: hit.pinned, type: front.type }] : [];
    })[0];
  const pinning = pinned ? `, which pins the ${PIECE_NAMES[pinned.type]} on ${pinned.square}` : '';
  return `Attacks the ${PIECE_NAMES[target.type]} on ${target.square}${pinning}`;
}

const KICK_REASON = /^Attacks the \w+ on [a-h][1-8](, which pins the \w+ on [a-h][1-8])?$/;

/** A move's plain reasons beside its tactic card. A card for what the move
 * itself did (a pawn fork, a tempo won on the queen) already names the piece
 * the pawn hits; a card for what the move allowed means the piece need not
 * move at all (9…b5 "attacks the bishop on c4" and loses the pawn to Nxb5). */
export function withoutCardedKick(reasons: readonly string[], cards: { tacticOpportunity?: { found: boolean } | null; tacticAllowed?: object | null }): string[] {
  const carded = cards.tacticOpportunity?.found === true || Boolean(cards.tacticAllowed);
  return carded ? reasons.filter((reason) => !KICK_REASON.test(reason)) : [...reasons];
}

/** The squares the pawn that just moved could legally take on, were it its
 * side's turn again: a pawn pinned to its king attacks nothing. */
function pawnCaptures(fenAfter: string, move: Move): Set<string> {
  const again = flipActiveColorFen(fenAfter);
  if (!again) return new Set();
  return new Set(
    new Chess(again)
      .moves({ square: move.to, verbose: true })
      .filter((capture) => capture.captured !== undefined)
      .map((capture) => capture.to)
  );
}
