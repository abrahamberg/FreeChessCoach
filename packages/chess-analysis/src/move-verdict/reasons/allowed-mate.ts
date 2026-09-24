import { gapOf, type EvalPair } from '../eval-pair.js';
import { allowedCardOf, mateAllowedCard, type ReasonCheck } from './confirmed.js';

/**
 * The engine's reply to the played move mates, and the best line didn't
 * allow it: the whole gap is the mate. The card is the reply's own chance
 * when it names one, otherwise a bare checkmate card.
 */
export const checkAllowedMate: ReasonCheck = (ctx) => {
  const { best, played, mover, afterLine } = ctx.frame;
  const explained: EvalPair = { higherCpWhite: best, lowerCpWhite: played };
  const line = ctx.playedWalk.get();
  if (!line.mateAgainst || !gapOf(explained, mover).meaningful) return null;

  const tacticAllowed = allowedCardOf(ctx) ?? mateAllowedCard(afterLine?.moveSan);
  return { reason: 'allowedMate', explained, line, card: { tacticAllowed } };
};
