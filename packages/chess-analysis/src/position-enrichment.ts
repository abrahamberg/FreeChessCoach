import type { PositionFeatures } from '@chess-coach/shared';
import { diffPositionFeatures, type FeatureDelta } from './diff-features.js';
import { moveFlags, type MoveFlags } from './move-flags.js';
import { computePositionFeatures } from './position-features.js';
import type { ParsedPosition } from './pgn.js';

export interface PositionEnrichment {
  ply: number;
  features: PositionFeatures;
  moveFlags: MoveFlags | null;
  featureDelta: FeatureDelta | null;
}

/** Computes all static per-position and per-move signals in one replay pass. */
export function enrichPositions(positions: ParsedPosition[]): PositionEnrichment[] {
  const features = positions.map((position) => computePositionFeatures(position.fen));

  return positions.map((position, index) => {
    const currentFeatures = requireFeatures(features, index, position.ply);
    if (index === 0) return { ply: position.ply, features: currentFeatures, moveFlags: null, featureDelta: null };

    const previousPosition = positions[index - 1];
    const previousFeatures = requireFeatures(features, index - 1, position.ply - 1);
    if (!previousPosition || position.moveSan === null) {
      return { ply: position.ply, features: currentFeatures, moveFlags: null, featureDelta: null };
    }

    return {
      ply: position.ply,
      features: currentFeatures,
      moveFlags: moveFlags(previousPosition.fen, position.moveSan),
      featureDelta: diffPositionFeatures(previousFeatures, currentFeatures)
    };
  });
}

function requireFeatures(features: PositionFeatures[], index: number, ply: number): PositionFeatures {
  const result = features[index];
  if (!result) throw new Error(`Missing position features for ply ${ply}`);
  return result;
}
