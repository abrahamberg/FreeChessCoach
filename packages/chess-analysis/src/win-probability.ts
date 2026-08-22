import type { EngineLine } from '@chess-coach/shared';

const MATE_BASE = 2000;
const CP_CLAMP = 2000;
const WIN_PROBABILITY_SLOPE = 0.00368208;

type EvaluationScore = Pick<EngineLine, 'cp' | 'mateIn'>;
type PlayerColor = 'white' | 'black';

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
  return sign * (MATE_BASE - 10 * Math.min(Math.abs(mateIn), 50));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
