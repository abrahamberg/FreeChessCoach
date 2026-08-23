import type { EngineEval } from '@freechesscoach/shared';
import { moveAccuracy } from './accuracy-curve.js';
import { toCpWhite, winPctFor, winPctWhite, type PlayerColor } from './win-probability.js';

export type MoveMetric = {
  ply: number;
  cpBeforeWhite: number;
  cpAfterWhite: number;
  winPctBefore: number;
  winPctAfter: number;
  drop: number;
  accuracy: number;
};

export type MoveMetrics = MoveMetric[];

/** Builds the White-perspective win-percentage value for every analyzed position. */
export function buildWinPctSeries(evals: EngineEval[]): number[] {
  return evals.map((evalResult) => winPctWhite(cpWhiteFor(evalResult)));
}

/**
 * Computes the win-percentage loss from White-perspective values for a move.
 * Black's perspective is the inverse of White's, so an increase for White is
 * a drop for Black.
 */
export function computeMoveDrop(before: number, after: number, mover: PlayerColor): number {
  const drop = mover === 'white' ? before - after : after - before;
  return Math.max(0, drop);
}

/** Builds the per-move metrics from position evaluations and move colours. */
export function buildMoveMetrics(evals: EngineEval[], movers: PlayerColor[]): MoveMetrics {
  if (movers.length !== Math.max(evals.length - 1, 0)) {
    throw new RangeError(`Expected one mover per transition, got ${movers.length} movers for ${evals.length} evaluations`);
  }

  const cpWhiteByPosition = evals.map(cpWhiteFor);
  const winPctWhiteByPosition = buildWinPctSeries(evals);

  return movers.map((mover, index) => {
    const cpBeforeWhite = cpWhiteByPosition[index];
    const cpAfterWhite = cpWhiteByPosition[index + 1];
    const winPctBeforeWhite = winPctWhiteByPosition[index];
    const winPctAfterWhite = winPctWhiteByPosition[index + 1];
    if (
      cpBeforeWhite === undefined ||
      cpAfterWhite === undefined ||
      winPctBeforeWhite === undefined ||
      winPctAfterWhite === undefined
    ) {
      throw new RangeError(`Missing evaluation for ply ${index + 1}`);
    }

    const drop = computeMoveDrop(winPctBeforeWhite, winPctAfterWhite, mover);
    return {
      ply: index + 1,
      cpBeforeWhite,
      cpAfterWhite,
      winPctBefore: winPctFor(mover, cpBeforeWhite),
      winPctAfter: winPctFor(mover, cpAfterWhite),
      drop,
      accuracy: moveAccuracy(drop)
    };
  });
}

function cpWhiteFor(evalResult: EngineEval): number {
  const firstLine = evalResult.lines[0];
  return toCpWhite({ cp: firstLine?.cp ?? null, mateIn: firstLine?.mateIn ?? null });
}
