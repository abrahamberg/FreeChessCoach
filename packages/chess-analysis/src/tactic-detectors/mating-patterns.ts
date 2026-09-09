import type { Square } from 'chess.js';
import { kingSquareOf } from '../tactic-board-facts.js';
import { hasMateInOne, neighboursOf } from '../tactic-lookahead.js';
import type { TacticClaim } from '../tactic-claim.js';
import type { TacticDetector } from './types.js';

/**
 * The two mate motifs a single position can answer exactly, kept together
 * because both are about the shape of the mate rather than the material it
 * wins: a knight mating a king boxed in by its own pieces, and a net the king
 * cannot get out of even though it isn't mate yet.
 *
 * `checkmate` itself is not a detector — it comes off the move's own flags
 * before any detector runs — so these two never compete with it for the
 * headline; they add the *pattern* alongside it.
 */
export const smotheredMateDetector: TacticDetector = {
  type: 'smotheredMate',
  priority: 3,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || !ctx.after.isCheckmate()) return [];
    if (ctx.after.get(ctx.destination)?.type !== 'n') return [];
    const king = kingSquareOf(ctx.after, ctx.opponent);
    if (!king) return [];
    // Smothered means the king's own army is what traps it: every square it
    // could step to is occupied by its own side.
    const boxedIn = neighboursOf(king).every((square) => ctx.after!.get(square)?.color === ctx.opponent);
    if (!boxedIn) return [];

    const claim: TacticClaim = {
      type: 'smotheredMate',
      actor: ctx.destination,
      targets: [king],
      victim: null,
      gainKind: 'mate',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: [{ from: ctx.destination, to: king }], highlights: neighboursOf(king) },
      detail: `mates the king on ${king}, smothered by its own pieces`
    };
    return [claim];
  }
};

/**
 * Not mate yet, but every legal reply walks into one. Two plies and no
 * further — `forcedReplies` declines to enumerate an unforced position, so a
 * "net" here always means the opponent genuinely has almost no choices.
 */
export const matingNetDetector: TacticDetector = {
  type: 'matingNet',
  priority: 4,
  detect: (ctx) => {
    if (!ctx.after || !ctx.destination || ctx.after.isCheckmate()) return [];
    const replies = ctx.facts.replies();
    if (!replies || replies.length === 0) return [];
    if (!replies.every((reply) => hasMateInOne(reply.fen))) return [];

    const king = kingSquareOf(ctx.after, ctx.opponent);
    const claim: TacticClaim = {
      type: 'matingNet',
      actor: ctx.destination,
      targets: king ? [king as Square] : [],
      victim: null,
      gainKind: 'mate',
      expectedGain: 0,
      prize: null,
      evidence: { arrows: king ? [{ from: ctx.destination, to: king }] : [], highlights: [] },
      detail: 'closes the net — every answer runs into mate'
    };
    return [claim];
  }
};
