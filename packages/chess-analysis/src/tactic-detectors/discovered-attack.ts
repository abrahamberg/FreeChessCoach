import { discoveredAttack } from '../tactic-discovered.js';
import type { TacticDetector } from './types.js';

/** Ignores `ctx.after`/`ctx.afterAttackMap` — the algorithm needs its own
 * before/after diff shape, not a single replayed position. */
export const discoveredAttackDetector: TacticDetector = {
  type: 'discoveredAttack',
  priority: 30,
  detect: (ctx) => discoveredAttack(ctx.fenBefore, ctx.moveSan, ctx.mover)
};
