import { gainCapCp } from '../ceilings.js';
import { gapOf, narrowTo, type EvalPair } from '../eval-pair.js';
import { materialAgrees, type ReasonCheck } from './confirmed.js';

/**
 * The player found the tactic (the engine's, or an equally good one of
 * their own — `played-tactic-alternative.ts`): worth gap(B, R), capped at
 * what the played line captures. R falls back to S when no line carries
 * another headline. Winning a rook while handing back the queen is not a
 * find: the played line has to net a gain.
 */
export const checkFoundTactic: ReasonCheck = (ctx) => {
  const { best, second, mover } = ctx.frame;
  const chance = ctx.chance.get();
  if (!chance?.found) return null;

  const reference = ctx.reference.get() ?? second;
  if (reference === null) return null;
  const pair: EvalPair = { higherCpWhite: best, lowerCpWhite: reference };
  const line = ctx.playedWalk.get();
  if (!gapOf(pair, mover).meaningful || !materialAgrees(line, 'gain', chance.gain?.kind)) return null;

  const explained = narrowTo(pair, gainCapCp(line), mover);
  return { reason: 'foundTactic', explained, line, card: { tacticOpportunity: chance } };
};
