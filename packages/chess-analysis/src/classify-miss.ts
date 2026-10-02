import type { MoveQuality } from '@freechesscoach/shared';
import { toCpWhite, winPctFor } from './win-probability.js';
import type { MoveClassificationInput, SeverityQuality } from './classify-context.js';
import { CONFIG } from './config.js';
import { saidMateIn } from './mate-count.js';

const { opportunityWinPctMin: OPPORTUNITY_WIN_PCT_MIN, threwAwayDropMin: THREW_AWAY_DROP_MIN } = CONFIG.miss;

export interface MissClassificationInput {
  severity: SeverityQuality;
  mover: MoveClassificationInput['mover'];
  evalBefore: MoveClassificationInput['evalBefore'];
  evalAfter: MoveClassificationInput['evalAfter'];
  features?: MoveClassificationInput['features'];
  /** The played move mated: nothing was given up, whatever the engine's first choice was. */
  isCheckmate?: boolean;
}

export interface MissClassificationResult {
  classification: MoveQuality;
  underlyingSeverity?: SeverityQuality;
}

/** Applies the final M1-M4 miss re-label without changing the raw drop. */
export function classifyMiss(input: MissClassificationInput): MissClassificationResult {
  const bestLine = input.evalBefore.lines[0];
  if (bestLine && gaveUpShortMate(input, bestLine)) return { classification: 'miss', underlyingSeverity: input.severity };
  if (!isMissSeverity(input.severity)) return { classification: input.severity };

  if (!bestLine || !hasOpportunity(input, bestLine)) return { classification: input.severity };
  if (!threwAwayOpportunity(input, bestLine)) return { classification: input.severity };
  return { classification: 'miss', underlyingSeverity: input.severity };
}

/**
 * M0: the mover had a forced mate and the position after the move has none
 * for them. Every mate is past 99.9% win probability, so the move loses no
 * accuracy and its tier is "excellent": 22…Qc3 gave up a mate, stayed at
 * -13.9 and wore that badge.
 *
 * Only a mate the review would put a number on (`saidMateIn`: short, and
 * within what this search can stand behind). A long mate is for strong
 * players with obvious forcing moves, and a shallow search's "mate in 9"
 * may not be one. A slower mate is still a mate. No line after the move
 * means it was not searched (or the game ended): nothing is claimed.
 */
function gaveUpShortMate(input: MissClassificationInput, bestLine: typeof input.evalBefore.lines[number]): boolean {
  const matesFor = (line: { mateIn: number | null }): boolean => line.mateIn !== null && line.mateIn !== 0 && line.mateIn > 0 === (input.mover === 'white');
  if (input.isCheckmate || !matesFor(bestLine) || saidMateIn(bestLine, input.evalBefore) === null) return false;
  const afterLine = input.evalAfter.lines[0];
  return afterLine !== undefined && !matesFor(afterLine);
}

function isMissSeverity(severity: SeverityQuality): boolean {
  return severity === 'inaccuracy' || severity === 'mistake' || severity === 'blunder';
}

function hasOpportunity(input: MissClassificationInput, bestLine: typeof input.evalBefore.lines[number]): boolean {
  if (bestLine.mateIn !== null) {
    const mateForMover = input.mover === 'white' ? bestLine.mateIn > 0 : bestLine.mateIn < 0;
    if (mateForMover) return true;
  }
  return winPctFor(input.mover, toCpWhite(bestLine)) >= OPPORTUNITY_WIN_PCT_MIN;
}

function threwAwayOpportunity(input: MissClassificationInput, bestLine: typeof input.evalBefore.lines[number]): boolean {
  const bestWin = winPctFor(input.mover, toCpWhite(bestLine));
  const afterLine = input.evalAfter.lines[0];
  const afterWin = afterLine ? winPctFor(input.mover, toCpWhite(afterLine)) : 0;
  if (afterWin <= bestWin - THREW_AWAY_DROP_MIN) return true;

  const mateBefore = bestLine.mateIn !== null
    && (input.mover === 'white' ? bestLine.mateIn > 0 : bestLine.mateIn < 0);
  const mateAfter = afterLine?.mateIn !== null
    && afterLine !== undefined
    && (input.mover === 'white' ? afterLine.mateIn > 0 : afterLine.mateIn < 0);
  return mateBefore && !mateAfter;
}

export type { MoveClassificationInput } from './classify-context.js';
