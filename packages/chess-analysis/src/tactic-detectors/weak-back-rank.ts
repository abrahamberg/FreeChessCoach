import { exploitsWeakBackRank } from '../tactic-back-rank.js';
import type { TacticDetector } from './types.js';

export const weakBackRankDetector: TacticDetector = {
  type: 'weakBackRank',
  priority: 45,
  detect: (ctx) =>
    ctx.after !== null &&
    ctx.afterAttackMap !== null &&
    ctx.destination !== null &&
    exploitsWeakBackRank(ctx.after, ctx.afterAttackMap, ctx.mover, ctx.destination)
};
