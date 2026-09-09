import { Chess } from 'chess.js';
import { pieceNameAt } from '../tactic-board-facts.js';
import { buildTacticDetectionContext, type TacticDetectionContext } from './context.js';
import { forkDetector } from './fork.js';
import { skewerDetector } from './skewer.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * A sacrifice that drags an enemy piece onto a square where the mover then
 * has a fork or a skewer.
 *
 * `attractionSac` is the same shape with the enemy *king* dragged out, which
 * is a different card ("you dragged their king into the open") and so a
 * different motif — they share this file because they share every line of the
 * computation and differ only in which piece is lured.
 *
 * Both need a reply to be looked past, which is why they sit behind
 * `tactic-lookahead.ts`'s bounded walk rather than in the static gates: a
 * decoy *is* a sacrifice, so every static safety test says it loses material,
 * and that is the point of it.
 */
export const decoyDetector: TacticDetector = {
  type: 'decoy',
  priority: 44,
  detect: (context) => decoyClaims(context, 'decoy')
};

export const attractionSacDetector: TacticDetector = {
  type: 'attractionSac',
  priority: 43,
  detect: (context) => decoyClaims(context, 'attractionSac')
};

function decoyClaims(context: TacticDetectionContext, type: 'decoy' | 'attractionSac'): TacticClaim[] {
  const after = context.after;
  const destination = context.destination;
  if (!after || !destination) return [];

  const replies = context.facts.replies();
  if (!replies || replies.length === 0) return [];
  // Every legal answer has to be taking the offered piece, or the opponent
  // was never lured anywhere.
  if (!replies.every((reply) => reply.to === destination && reply.captured)) return [];

  const wantsKing = type === 'attractionSac';
  if (replies.every((reply) => after.get(reply.from)?.type === 'k') !== wantsKing) return [];

  const mover = context.mover === 'w' ? 'white' : 'black';
  if (!replies.every((reply) => hasFollowUpTactic(reply.fen, mover))) return [];

  const claim: TacticClaim = {
    type,
    actor: destination,
    targets: [destination],
    victim: null,
    gainKind: 'tempo',
    expectedGain: 0,
    prize: null,
    evidence: { arrows: [], highlights: [destination] },
    detail: wantsKing
      ? `drags the king onto ${destination}`
      : `drags the ${pieceNameAt(after, replies[0]!.from)} onto ${destination}`
  };
  return [claim];
}

/** Does the mover have a fork or a skewer once the lure has been taken? Only
 * those two: they are the motifs whose whole value is the square the decoyed
 * piece now stands on. */
function hasFollowUpTactic(fen: string, mover: 'white' | 'black'): boolean {
  const board = new Chess(fen);
  if (board.turn() !== (mover === 'white' ? 'w' : 'b')) return false;

  return board.moves().some((san) => {
    const context = buildTacticDetectionContext(fen, san, mover);
    return forkDetector.detect(context).length > 0 || skewerDetector.detect(context).length > 0;
  });
}
