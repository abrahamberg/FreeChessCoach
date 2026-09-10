import { isImprovableQuality, type ClassifiedMoveDto } from '@freechesscoach/shared';

/**
 * What a move handed the opponent.
 *
 * `docs/tactics-rework.md` §5 layer 4 names four outcome verbs — found,
 * missed, allowed, prevented — and only three of them had a card. "Allowed"
 * is the one that answers *why the move is a blunder*, and without it a
 * queen dropped to a pin was narrated only on the opponent's next move, as a
 * chance they then missed:
 *
 *     9…Qd7  ??  They missed a chance to break the pin with Be7.
 *     10.Bxf6 ?! You missed a chance to win a queen … with Bb5.
 *
 * The reader of the first card is never told what Qd7 actually cost.
 *
 * There is nothing new to detect: the tactic Qd7 allowed *is* the
 * opportunity already computed for the next ply, so this reads it off that
 * move rather than re-verifying anything, and the two cards name the same
 * motif, prize and geometry. The arrows even land on the right board — the
 * next ply's opportunity is drawn on the position this move produced.
 */
export function computeTacticAllowed(
  move: ClassifiedMoveDto,
  next: ClassifiedMoveDto | undefined
): ClassifiedMoveDto['tacticAllowed'] {
  // You do not "allow" anything by playing a move that cost nothing — the
  // tactic was in the position, not in the move, and the opponent's own card
  // is where it belongs.
  if (!isImprovableQuality(move.quality)) return undefined;

  const opportunity = next?.tacticOpportunity;
  if (!opportunity || !isHardGain(opportunity.gain)) return undefined;

  return {
    type: opportunity.type,
    detail: opportunity.detail,
    visual: opportunity.visual,
    ...(opportunity.gain ? { gain: opportunity.gain } : {}),
    ...(opportunity.horizon ? { horizon: opportunity.horizon } : {}),
    ...(opportunity.confidence === undefined ? {} : { confidence: opportunity.confidence }),
    ...(byMoveSanOf(next) ? { byMoveSan: byMoveSanOf(next) } : {})
  };
}

/**
 * Material or mate only. A positional edge handed over is not what "you
 * allowed this" means to a reader, and pricing every mistake with the
 * softest thing that became available is how a card stops being read.
 */
function isHardGain(gain: NonNullable<ClassifiedMoveDto['tacticOpportunity']>['gain']): boolean {
  if (!gain) return false;
  return gain.kind === 'mate' || (gain.kind === 'material' && gain.pawns > 0);
}

/** The reply that collects it: whichever move the next ply's card was read
 * off — the engine's, or the opponent's own when they matched it. */
function byMoveSanOf(next: ClassifiedMoveDto | undefined): string | undefined {
  return next?.tacticOpportunity?.embodiedBySan ?? next?.bestMoveSan;
}
