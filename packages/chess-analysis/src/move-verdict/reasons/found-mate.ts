import { gapOf, type EvalPair } from '../eval-pair.js';
import { mateOpportunityCard, type ReasonCheck } from './confirmed.js';

/**
 * The best line mates, the played move keeps the mate, and the second line
 * doesn't: finding it is worth gap(B, S).
 */
export const checkFoundMate: ReasonCheck = (ctx) => {
  const { best, second, mover } = ctx.frame;
  if (second === null) return null;
  const explained: EvalPair = { higherCpWhite: best, lowerCpWhite: second };
  const line = ctx.playedWalk.get();
  if (!line.mateFor || !gapOf(explained, mover).meaningful) return null;

  const chance = ctx.chance.get();
  const tacticOpportunity = chance?.found ? chance : mateOpportunityCard(ctx.input.move.moveSan, true);
  return { reason: 'foundMate', explained, line, card: { tacticOpportunity } };
};
