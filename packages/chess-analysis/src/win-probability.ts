import type { EngineLine } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

const { mateBase: MATE_BASE, cpClamp: CP_CLAMP, slope: WIN_PROBABILITY_SLOPE, mateDecayPerPly: MATE_DECAY_PER_PLY, mateInClamp: MATE_IN_CLAMP } = CONFIG.winProbability;

type EvaluationScore = Pick<EngineLine, 'cp' | 'mateIn'>;
export type PlayerColor = 'white' | 'black';

/** Folds a White-perspective engine evaluation into the shared cp scale. */
export function toCpWhite(evalObj: EvaluationScore): number {
  if (evalObj.mateIn !== null) return mateScore(evalObj.mateIn);

  return clamp(evalObj.cp ?? 0, -CP_CLAMP, CP_CLAMP);
}

/** Converts a White-perspective centipawn score to a win percentage. */
export function winPctWhite(cpWhite: number): number {
  return 100 / (1 + Math.exp(-WIN_PROBABILITY_SLOPE * cpWhite));
}

/** Converts a White-perspective score to the specified player's win percentage. */
export function winPctFor(color: PlayerColor, cpWhite: number): number {
  const whiteWinPct = winPctWhite(cpWhite);
  return color === 'white' ? whiteWinPct : 100 - whiteWinPct;
}

function mateScore(mateIn: number): number {
  const sign = mateIn >= 0 ? 1 : -1;
  return sign * (MATE_BASE - MATE_DECAY_PER_PLY * Math.min(Math.abs(mateIn), MATE_IN_CLAMP));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
