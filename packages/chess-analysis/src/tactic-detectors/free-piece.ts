import { captureOpportunities } from '../tactics.js';
import type { TacticDetector } from './types.js';

export const freePieceDetector: TacticDetector = {
  type: 'freePiece',
  priority: 60,
  detect: (ctx) => {
    const capture = captureOpportunities(ctx.before, ctx.beforeAttackMap).find((entry) => entry.moveSan === ctx.moveSan);
    return capture?.favorable ?? false;
  }
};
