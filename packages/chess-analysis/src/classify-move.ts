import type { MoveQuality } from '@chess-coach/shared';
import { isBrilliantMove } from './classify-brilliant.js';
import type { MoveClassificationInput } from './classify-context.js';
import { isGreatMove } from './classify-great.js';
import { classifyMiss } from './classify-miss.js';
import { classifySeverity } from './classify-severity.js';

export interface MoveClassificationResult {
  classification: MoveQuality;
  underlyingSeverity?: MoveQuality;
}

/** The §5.1 decision order. Every branch returns the first matching label. */
export function classifyMove(input: MoveClassificationInput): MoveClassificationResult {
  if (input.isBookMove) return { classification: 'book' };
  if (input.moveFlags.legalMoveCount === 1) return { classification: 'forced' };
  if (isBrilliantMove(input)) return { classification: 'brilliant' };
  if (isGreatMove(input)) return { classification: 'great' };
  if (input.moveSan === input.evalBefore.lines[0]?.moveSan) return { classification: 'best' };

  const severity = classifySeverity(input);
  return classifyMiss({
    severity,
    mover: input.mover,
    evalBefore: input.evalBefore,
    evalAfter: input.evalAfter,
    features: input.features
  });
}

export type { MoveClassificationInput } from './classify-context.js';
