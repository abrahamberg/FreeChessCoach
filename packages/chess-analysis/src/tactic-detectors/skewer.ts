import { skewers } from '../tactic-skewers.js';
import type { TacticDetector } from './types.js';

export const skewerDetector: TacticDetector = {
  type: 'skewer',
  priority: 15,
  detect: (ctx) => ctx.after !== null && ctx.destination !== null && skewers(ctx.after).some((hit) => hit.by === ctx.destination)
};
