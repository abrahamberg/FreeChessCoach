import type { MoveClassificationInput } from './classify-context.js';
import { isBrilliantMove } from './classify-brilliant.js';
import { bandIndex, resultBand } from './classify-severity.js';
import { toCpWhite, winPctFor } from './win-probability.js';

/** Evaluates G1-G4. Missing MultiPV data fails closed. */
export function isGreatMove(input: MoveClassificationInput): boolean {
  if (input.isBookMove || input.moveFlags.legalMoveCount <= 1 || isBrilliantMove(input)) return false;

  const [best, second] = input.evalBefore.lines;
  if (!best || !second) return false;
  const isTopMove = input.moveSan === best.moveSan || input.drop <= 1;
  if (!isTopMove) return false;

  const gap = Math.abs(winPctFor(input.mover, toCpWhite(best)) - winPctFor(input.mover, toCpWhite(second)));
  if (gap < 10) return false;
  return hasMateriality(input, second);
}

function hasMateriality(input: MoveClassificationInput, second: typeof input.evalBefore.lines[number]): boolean {
  const beforeBand = bandIndex(resultBand(input.beforeWin));
  const afterBand = bandIndex(resultBand(input.afterWin));
  if (afterBand > beforeBand) return true;

  const secondBand = bandIndex(resultBand(winPctFor(input.mover, toCpWhite(second))));
  if (beforeBand - secondBand >= 2) return true;

  return entersForcedMate(input.evalBefore.lines[0]?.mateIn, input.mover)
    && !entersForcedMate(second.mateIn, input.mover);
}

function entersForcedMate(mateIn: number | null | undefined, mover: 'white' | 'black'): boolean {
  if (mateIn === null || mateIn === undefined) return false;
  return mover === 'white' ? mateIn > 0 : mateIn < 0;
}

export type { MoveClassificationInput } from './classify-context.js';
