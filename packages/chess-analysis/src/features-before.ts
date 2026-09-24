import type { ClassifiedMoveDto, PositionFeatures } from '@freechesscoach/shared';
import { computePositionFeatures } from './position-features.js';

type FeatureSource = Pick<ClassifiedMoveDto, 'fenAfter' | 'features'>;

/**
 * The features of `fenBefore`, reused from the previous move's own
 * `features` (computed on its `fenAfter`, the same position) when that move
 * carries them, and computed only otherwise (Task 77.3). Features are a pure
 * function of the FEN, so the reuse cannot change the result.
 */
export function featuresBeforeOf(fenBefore: string, previous: FeatureSource | undefined): PositionFeatures {
  if (previous?.features && previous.fenAfter === fenBefore) return previous.features;
  return computePositionFeatures(fenBefore);
}
