import type { TacticMotifType } from '@freechesscoach/shared';
import type { TacticDetectionContext } from './context.js';

/**
 * One motif's detection logic, in its own file. `checkmate`/`brilliantSacrifice`
 * are NOT detectors — they're answerable straight from the raw
 * `TacticMotifContext` (see classify-tactic-motif.ts's pre-checks), so only
 * motifs that need the replay/AttackMap context belong in the registry.
 */
export interface TacticDetector {
  type: Exclude<TacticMotifType, 'checkmate' | 'brilliantSacrifice' | 'other'>;
  /** Ascending = checked first. Left with gaps of 10 so a future tactic can
   * be inserted between two existing ones without renumbering everything. */
  priority: number;
  detect(context: TacticDetectionContext): boolean;
}
