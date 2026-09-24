import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { CONFIG } from './config.js';
import { winPctFor, type PlayerColor } from './win-probability.js';

const {
  minWinPctGap: MIN_WIN_PCT_GAP,
  minOutcomeChangeWinPctGap: MIN_OUTCOME_CHANGE_WIN_PCT_GAP,
  outcomeWinPct: OUTCOME_WIN_PCT,
  decisiveBandMinCpGap: DECISIVE_BAND_MIN_CP_GAP
} = CONFIG.evalWitness;

type OutcomeBand = 'winning' | 'balanced' | 'losing';

/**
 * How far apart two evaluations of the same decision sit, from the mover's
 * side — the eval the mover should have had (the best line, or the chance
 * they had) against the one they got.
 */
export interface EvalGap {
  /** Mover win% of the higher eval minus that of the lower one. Negative
   * when the "lower" eval is actually the better one (engine noise, or a
   * move the engine found better on its own reply). */
  winPctGap: number;
  /** The same difference in mover-perspective centipawns, on the shared
   * clamped scale where mate is folded in as ±(2000 − 10·n). */
  cpGap: number;
  /** The two evals fall in different outcome bands — winning, balanced or
   * losing (`CONFIG.evalWitness.outcomeWinPct`). */
  outcomeChanged: boolean;
  /** Both evals are winning, or both are losing: win% has saturated, so
   * the gap is read in centipawns instead. */
  sameDecisiveBand: boolean;
  meaningful: boolean;
}

/**
 * The eval witness behind every tactical verdict and diagnostic failure: a
 * shape on the board (a hanging piece, a fork, a threat left standing)
 * proposes a verdict, and this says whether the evaluation agrees that the
 * decision actually gained or lost anything.
 *
 * The stored engine eval is already the value at the end of the engine's
 * own line, so a sacrifice that lures the queen evaluates well at the move
 * itself — there is nothing to walk. What matters is comparing against the
 * right thing: the best alternative, never the position before the move (in
 * a lost position a good move can still cost a little).
 *
 * A gap is meaningful when any of these holds:
 * - the win% gap reaches `minWinPctGap` (the mistake boundary);
 * - the outcome band changed and the win% gap reaches
 *   `minOutcomeChangeWinPctGap` — +40 to −40 changes the sign, but not the
 *   game, and stays below both bars;
 * - both sit in the same winning or losing band and the centipawn gap reaches
 *   `decisiveBandMinCpGap` — dropping a queen at +15 still counts even though
 *   win% hardly moves, while mate-in-5 instead of mate-in-3 does not.
 *
 * Both inputs are White-perspective, as `ClassifiedMoveDto.cpBefore`/`cpAfter`
 * and `alternatives[].cp` are stored.
 */
export function evalGap(higherCpWhite: number, lowerCpWhite: number, mover: PlayerColor): EvalGap {
  const higherWinPct = winPctFor(mover, higherCpWhite);
  const lowerWinPct = winPctFor(mover, lowerCpWhite);
  const winPctGap = higherWinPct - lowerWinPct;
  const cpGap = moverCp(higherCpWhite, mover) - moverCp(lowerCpWhite, mover);
  const higherBand = outcomeBand(higherWinPct);
  const outcomeChanged = higherBand !== outcomeBand(lowerWinPct);
  const sameDecisiveBand = !outcomeChanged && higherBand !== 'balanced';

  return {
    winPctGap,
    cpGap,
    outcomeChanged,
    sameDecisiveBand,
    meaningful: isMeaningful(winPctGap, cpGap, outcomeChanged, sameDecisiveBand)
  };
}

/**
 * Best line against the move actually played: `cpBefore` is the eval of the
 * engine's first line at this position, `cpAfter` the eval once the played
 * move is on the board. `null` for a move stored before either existed —
 * callers fall back to the move's own quality there.
 */
export function playedMoveGap(move: Pick<ClassifiedMoveDto, 'cpBefore' | 'cpAfter' | 'mover'>): EvalGap | null {
  if (move.cpBefore === undefined || move.cpAfter === undefined) return null;
  return evalGap(move.cpBefore, move.cpAfter, move.mover);
}

/** A White-perspective score as seen by `mover`. */
export function moverCp(cpWhite: number, mover: PlayerColor): number {
  return mover === 'white' ? cpWhite : -cpWhite;
}

function isMeaningful(winPctGap: number, cpGap: number, outcomeChanged: boolean, sameDecisiveBand: boolean): boolean {
  if (winPctGap >= MIN_WIN_PCT_GAP) return true;
  if (outcomeChanged && winPctGap >= MIN_OUTCOME_CHANGE_WIN_PCT_GAP) return true;
  return sameDecisiveBand && cpGap >= DECISIVE_BAND_MIN_CP_GAP;
}

function outcomeBand(winPct: number): OutcomeBand {
  if (winPct >= OUTCOME_WIN_PCT) return 'winning';
  if (winPct <= 100 - OUTCOME_WIN_PCT) return 'losing';
  return 'balanced';
}
