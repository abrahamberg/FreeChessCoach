import type { MoveQuality } from '@freechesscoach/shared';
import { Chess, type Color, type Square } from 'chess.js';
import { buildAttackMap } from './attack-map.js';
import { discoveredAttack } from './tactic-discovered.js';
import { pins } from './tactic-pins.js';
import { removesDefender } from './tactic-removes-defender.js';
import { trappedPieces } from './tactic-trapped.js';
import { captureOpportunities, forks } from './tactics.js';

export type TacticMotifType =
  | 'checkmate'
  | 'brilliantSacrifice'
  | 'fork'
  | 'pin'
  | 'discoveredAttack'
  | 'removesDefender'
  | 'trappedPiece'
  | 'freePiece'
  | 'other';

export interface TacticMotifContext {
  fenBefore: string;
  moveSan: string;
  mover: 'white' | 'black';
  /** This move's own already-computed classification — for a played move,
   * the result of `classifyMove`; for the engine's best move (evaluated as
   * if it had been played, to find the "opportunity"), the caller's own
   * hypothetical classification. */
  quality: MoveQuality;
  isCheckmate: boolean;
  /** §7.2's existing "is this a tactical position" signal — gates the
   * `'other'` catch-all and the `null` ("not tactical at all") result. */
  isTacticalPosition: boolean;
}

function toColor(mover: 'white' | 'black'): Color {
  return mover === 'white' ? 'w' : 'b';
}

/**
 * Tags a single move with the most-specific tactical motif it embodies, in
 * priority order (checkmate first, a catch-all `'other'` last) — a move can
 * only ever carry one tag, mirroring `classify-move.ts`'s decision order.
 */
export function classifyTacticMotif(context: TacticMotifContext): TacticMotifType | null {
  if (context.isCheckmate) return 'checkmate';
  if (context.quality === 'brilliant') return 'brilliantSacrifice';

  const before = new Chess(context.fenBefore);
  const beforeAttackMap = buildAttackMap(before);
  const after = new Chess(context.fenBefore);

  let destination: Square | null = null;
  try {
    const move = after.move(context.moveSan);
    destination = move ? (move.to as Square) : null;
  } catch {
    destination = null;
  }
  if (!destination) return context.isTacticalPosition ? 'other' : null;

  const afterAttackMap = buildAttackMap(after);
  if (forks(after, afterAttackMap).some((hit) => hit.square === destination)) return 'fork';
  if (pins(after).some((hit) => hit.by === destination)) return 'pin';

  const mover = toColor(context.mover);
  if (discoveredAttack(context.fenBefore, context.moveSan, mover)) return 'discoveredAttack';
  if (removesDefender(context.fenBefore, context.moveSan, mover)) return 'removesDefender';

  const opponent: Color = mover === 'w' ? 'b' : 'w';
  if (trappedPieces(after, opponent).length > 0) return 'trappedPiece';

  const capture = captureOpportunities(before, beforeAttackMap).find((entry) => entry.moveSan === context.moveSan);
  if (capture?.favorable) return 'freePiece';

  return context.isTacticalPosition ? 'other' : null;
}
