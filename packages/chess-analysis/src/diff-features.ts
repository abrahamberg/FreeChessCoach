import type { FeatureDeltaDto, ForkSchema, PositionFeatures } from '@freechesscoach/shared';
import type { z } from 'zod';
import { newLoosePieces } from './board-facts/loose-pieces.js';

export type Fork = z.infer<typeof ForkSchema>;
export type FeatureDelta = FeatureDeltaDto;

function forkKey(fork: Fork): string {
  return `${fork.square}:${fork.piece}`;
}

/** The part of the delta that needs only the two feature sets. */
export function diffPositionFeatures(before: PositionFeatures, after: PositionFeatures): Pick<FeatureDelta, 'newForks' | 'mobilityDelta'> {
  const beforeForkKeys = new Set(before.forks.map(forkKey));
  return {
    newForks: after.forks.filter((fork) => !beforeForkKeys.has(forkKey(fork))),
    mobilityDelta: after.availableMoves.length - before.availableMoves.length
  };
}

/**
 * What concretely changed between two positions — used to summarize what a
 * move (or the engine's best instead) changed on the board, rather than
 * dumping both full feature sets for the reader to compare by hand.
 * Deliberately narrow: only the signals a coaching callout needs (new forks,
 * newly loose pieces, mobility swing), not an exhaustive field-by-field diff.
 */
export function positionDelta(before: PositionFeatures, after: PositionFeatures, fenBefore: string, fenAfter: string): FeatureDelta {
  return { ...diffPositionFeatures(before, after), newLoosePieces: newLoosePieces(fenBefore, fenAfter) };
}
