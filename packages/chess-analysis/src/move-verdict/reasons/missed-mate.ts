import { gapOf, type EvalPair } from '../eval-pair.js';
import { mateOpportunityCard, type ReasonCheck } from './confirmed.js';

/**
 * The mover had mate on the best line and played something else: the whole
 * gap is the mate. The card is the best move's own chance when a detector
 * names it, otherwise a bare checkmate card.
 */
export const checkMissedMate: ReasonCheck = (ctx) => {
  const { best, played, mover, bestLine } = ctx.frame;
  const explained: EvalPair = { higherCpWhite: best, lowerCpWhite: played };
  const line = ctx.bestWalk.get();
  if (!line.mateFor || !gapOf(explained, mover).meaningful) return null;

  const chance = ctx.chance.get();
  const tacticOpportunity = chance ? { ...chance, found: false } : mateOpportunityCard(bestLine.moveSan, false);
  return { reason: 'missedMate', explained, line, card: { tacticOpportunity } };
};
