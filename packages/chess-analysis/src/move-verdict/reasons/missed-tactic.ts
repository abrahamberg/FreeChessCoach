import { withMissWitness } from '../../game-tactic-motifs.js';
import { gainCapCp } from '../ceilings.js';
import { betterFor, gapOf, narrowTo, type EvalPair } from '../eval-pair.js';
import { materialAgrees, type ReasonCheck } from './confirmed.js';

/**
 * The best move carried a tactic the player didn't find: worth
 * gap(B, max(R, P)) — the part of the loss a move without the tactic would
 * have kept — capped at what the best line can capture. Its material walk is
 * the best line, and it has to net a gain.
 */
export const checkMissedTactic: ReasonCheck = (ctx) => {
  const { move } = ctx.input;
  const { best, played, mover } = ctx.frame;
  const chance = withMissWitness(move, ctx.chance.get());
  if (!chance || chance.found) return null;

  const reference = ctx.reference.get();
  const pair: EvalPair = { higherCpWhite: best, lowerCpWhite: reference === null ? played : betterFor(mover, reference, played) };
  const line = ctx.bestWalk.get();
  if (!gapOf(pair, mover).meaningful || !materialAgrees(line, 'gain', chance.gain?.kind)) return null;

  const explained = narrowTo(pair, gainCapCp(line), mover);
  return { reason: 'missedTactic', explained, line, card: { tacticOpportunity: chance } };
};
