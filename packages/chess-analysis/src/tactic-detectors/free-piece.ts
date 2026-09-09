import type { Square } from 'chess.js';
import { PIECE_NAMES } from '../move-reasons.js';
import { PIECE_VALUES } from '../tactics.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * This move captures something. Whether it captures it *for free* is the
 * verifier's question, not the detector's: the old gate ("the captured piece
 * is worth at least the capturer, or its square has no defenders") has no
 * notion of an exchange sequence and no notion of a recapture, which is why
 * 97 of 113 recaptures in opening theory carried this label
 * (`docs/tactics-rework.md` §2).
 */
export const freePieceDetector: TacticDetector = {
  type: 'freePiece',
  priority: 60,
  detect: (ctx) => {
    const move = ctx.move;
    if (!move || move.captured === undefined || !ctx.destination) return [];
    const captured = move.captured;
    const target = ctx.destination as Square;

    const claim: TacticClaim = {
      type: 'freePiece',
      actor: target,
      targets: [target],
      victim: target,
      gainKind: 'material',
      expectedGain: PIECE_VALUES[captured],
      prize: PIECE_NAMES[captured],
      evidence: { arrows: [{ from: move.from as Square, to: target }], highlights: [] },
      detail: `captures the ${PIECE_NAMES[captured]} on ${target}`
    };
    return [claim];
  }
};
