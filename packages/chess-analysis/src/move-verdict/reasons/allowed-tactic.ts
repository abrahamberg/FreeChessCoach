import { lossCapCp } from '../ceilings.js';
import { gapOf, narrowTo, worseFor, type EvalPair } from '../eval-pair.js';
import { allowedCardOf, materialAgrees, type ReasonCheck } from './confirmed.js';
import { hungMaterialCard } from './hung-material.js';

/**
 * The reply wins something through a tactic the played move handed over:
 * worth gap(min(R, B), P), capped at what the refutation captures. R is used
 * only when a miss check already paid for it (the materiality witness never
 * runs for this reason alone); otherwise B stands in, the generous end. The
 * walk is the played move plus the refutation, which has to net a loss.
 * When no detector names the reply, a plain capture the walk keeps is the
 * card (`hung-material.ts`).
 */
export const checkAllowedTactic: ReasonCheck = (ctx) => {
  const { best, played, mover } = ctx.frame;
  const tacticAllowed = allowedCardOf(ctx) ?? hungMaterialCard(ctx);
  if (!tacticAllowed) return null;

  const reference = ctx.reference.peek()?.value ?? null;
  const pair: EvalPair = { higherCpWhite: reference === null ? best : worseFor(mover, reference, best), lowerCpWhite: played };
  const line = ctx.playedWalk.get();
  if (!gapOf(pair, mover).meaningful || !materialAgrees(line, 'loss', tacticAllowed.gain?.kind)) return null;

  const explained = narrowTo(pair, lossCapCp(line) ?? Infinity, mover);
  return { reason: 'allowedTactic', explained, line, card: { tacticAllowed } };
};
