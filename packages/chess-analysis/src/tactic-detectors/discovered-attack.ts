import { PIECE_NAMES } from '../piece-names.js';
import { pieceNameAt, pieceTypeAt, pieceValueAt } from '../tactic-board-facts.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/** Ignores `ctx.after`/`ctx.afterAttackMap` — the algorithm needs its own
 * before/after diff shape, not a single replayed position. The actor is the
 * *unveiled* piece, not the one that stepped aside: that is the piece whose
 * new line does the work, and the piece the arrow has to start from. */
export const discoveredAttackDetector: TacticDetector = {
  type: 'discoveredAttack',
  priority: 30,
  detect: (ctx) => {
    if (!ctx.after) return [];
    const hit = ctx.facts.discovered();
    if (!hit) return [];
    const after = ctx.after;
    const revealedIsKing = pieceTypeAt(after, hit.revealed) === 'k';

    const claim: TacticClaim = {
      type: 'discoveredAttack',
      actor: hit.piece,
      targets: [hit.revealed],
      victim: revealedIsKing ? null : hit.revealed,
      gainKind: revealedIsKing ? 'tempo' : 'material',
      expectedGain: revealedIsKing ? 0 : pieceValueAt(after, hit.revealed),
      prize: revealedIsKing ? null : pieceNameAt(after, hit.revealed),
      evidence: { arrows: [{ from: hit.piece, to: hit.revealed }], highlights: [] },
      detail: revealedIsKing
        ? `unveils the ${PIECE_NAMES[hit.pieceType]} on ${hit.piece} against the king`
        : `unveils the ${PIECE_NAMES[hit.pieceType]} on ${hit.piece} against the ${pieceNameAt(after, hit.revealed)} on ${hit.revealed}`
    };
    return [claim];
  }
};
