import { evalGap, moverCp, type EvalGap } from '../eval-witness.js';
import type { PlayerColor } from '../win-probability.js';

/**
 * Two White-perspective evals of one decision — the one the mover should
 * have had and the one a reason says they got. Every ceiling and every
 * explained value is one of these, so both are read through `evalGap`.
 */
export interface EvalPair {
  higherCpWhite: number;
  lowerCpWhite: number;
}

export function gapOf(pair: EvalPair, mover: PlayerColor): EvalGap {
  return evalGap(pair.higherCpWhite, pair.lowerCpWhite, mover);
}

/** Mover-perspective centipawns between the two, never negative. */
export function valueOf(pair: EvalPair, mover: PlayerColor): number {
  return Math.max(0, gapOf(pair, mover).cpGap);
}

/**
 * The pair with its lower end raised until the gap is at most `capCp` — a
 * material upper bound applied to an eval gap. `Infinity` leaves it alone.
 */
export function narrowTo(pair: EvalPair, capCp: number, mover: PlayerColor): EvalPair {
  if (!Number.isFinite(capCp)) return pair;
  const floor = moverCp(pair.higherCpWhite, mover) - capCp;
  const lower = Math.max(moverCp(pair.lowerCpWhite, mover), floor);
  return { ...pair, lowerCpWhite: fromMoverCp(lower, mover) };
}

/** Whichever of two White-perspective evals the mover prefers. */
export function betterFor(mover: PlayerColor, a: number, b: number): number {
  return moverCp(a, mover) >= moverCp(b, mover) ? a : b;
}

/** Whichever of two White-perspective evals the mover likes less. */
export function worseFor(mover: PlayerColor, a: number, b: number): number {
  return betterFor(mover, a, b) === a ? b : a;
}

function fromMoverCp(cp: number, mover: PlayerColor): number {
  return mover === 'white' ? cp : -cp;
}
