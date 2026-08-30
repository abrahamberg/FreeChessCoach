import { forks } from '../tactics.js';
import type { TacticDetector } from './types.js';

export const forkDetector: TacticDetector = {
  type: 'fork',
  priority: 10,
  detect: (ctx) =>
    ctx.after !== null &&
    ctx.afterAttackMap !== null &&
    ctx.destination !== null &&
    forks(ctx.after, ctx.afterAttackMap).some((hit) => hit.square === ctx.destination)
};
