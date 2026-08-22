import type { MoveQuality } from '@chess-coach/shared';
import { toCpWhite, winPctFor } from './win-probability.js';
import type { MoveClassificationInput, SeverityQuality } from './classify-context.js';

export interface MissClassificationInput {
  severity: SeverityQuality;
  mover: MoveClassificationInput['mover'];
  evalBefore: MoveClassificationInput['evalBefore'];
  evalAfter: MoveClassificationInput['evalAfter'];
  features?: MoveClassificationInput['features'];
}

export interface MissClassificationResult {
  classification: MoveQuality;
  underlyingSeverity?: SeverityQuality;
}

/** Applies the final M1-M4 miss re-label without changing the raw drop. */
export function classifyMiss(input: MissClassificationInput): MissClassificationResult {
  if (!isMissSeverity(input.severity)) return { classification: input.severity };

  const bestLine = input.evalBefore.lines[0];
  if (!bestLine || !hasOpportunity(input, bestLine)) return { classification: input.severity };
  if (!threwAwayOpportunity(input, bestLine)) return { classification: input.severity };
  return { classification: 'miss', underlyingSeverity: input.severity };
}

function isMissSeverity(severity: SeverityQuality): boolean {
  return severity === 'inaccuracy' || severity === 'mistake' || severity === 'blunder';
}

function hasOpportunity(input: MissClassificationInput, bestLine: typeof input.evalBefore.lines[number]): boolean {
  if (bestLine.mateIn !== null) {
    const mateForMover = input.mover === 'white' ? bestLine.mateIn > 0 : bestLine.mateIn < 0;
    if (mateForMover) return true;
  }
  return winPctFor(input.mover, toCpWhite(bestLine)) >= 75;
}

function threwAwayOpportunity(input: MissClassificationInput, bestLine: typeof input.evalBefore.lines[number]): boolean {
  const bestWin = winPctFor(input.mover, toCpWhite(bestLine));
  const afterLine = input.evalAfter.lines[0];
  const afterWin = afterLine ? winPctFor(input.mover, toCpWhite(afterLine)) : 0;
  if (afterWin <= bestWin - 15) return true;

  const mateBefore = bestLine.mateIn !== null
    && (input.mover === 'white' ? bestLine.mateIn > 0 : bestLine.mateIn < 0);
  const mateAfter = afterLine?.mateIn !== null
    && afterLine !== undefined
    && (input.mover === 'white' ? afterLine.mateIn > 0 : afterLine.mateIn < 0);
  return mateBefore && !mateAfter;
}

export type { MoveClassificationInput } from './classify-context.js';
