import { removesDefender } from '../tactic-removes-defender.js';
import type { TacticDetector } from './types.js';

/** Ignores `ctx.after`/`ctx.afterAttackMap` — same reason as discovered-attack.ts. */
export const removesDefenderDetector: TacticDetector = {
  type: 'removesDefender',
  priority: 40,
  detect: (ctx) => removesDefender(ctx.fenBefore, ctx.moveSan, ctx.mover) !== null
};
