import { opponentOf } from '../attack-map.js';
import { trappedPieces } from '../tactic-trapped.js';
import type { TacticDetector } from './types.js';

export const trappedPieceDetector: TacticDetector = {
  type: 'trappedPiece',
  priority: 50,
  detect: (ctx) => ctx.after !== null && trappedPieces(ctx.after, opponentOf(ctx.mover)).length > 0
};
