import type { MoveQuality, MovePhase } from '@chess-coach/shared';
import { accuracyForAggregate, aggregateAccuracy } from './game-accuracy.js';

export interface PhaseAccuracyMove {
  ply: number;
  mover: 'white' | 'black';
  quality: MoveQuality;
  drop: number;
  phase: MovePhase;
}

/**
 * §6.4 — accuracy restricted to one colour's moves in one phase, but the
 * volatility weights are the full-game ones (keyed by ply), never
 * recomputed from just the phase's plies — recomputing would desynchronise
 * the phase numbers from the game accuracy number (§6.4's explicit warning).
 */
export function phaseAccuracy(
  colour: 'white' | 'black',
  phase: MovePhase,
  moves: PhaseAccuracyMove[],
  fullGameWeights: ReadonlyMap<number, number>
): number | null {
  const relevant = moves.filter((move) => move.mover === colour && move.phase === phase);
  const accs = relevant.map((move) => accuracyForAggregate(move.quality, move.drop));
  const weights = relevant.map((move) => fullGameWeights.get(move.ply) ?? 0);
  return aggregateAccuracy(accs, weights);
}
