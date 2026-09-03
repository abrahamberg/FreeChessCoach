import type { MovePhase } from '@freechesscoach/shared';
import { phaseUnits } from './phase-signals.js';
import { CONFIG } from './config.js';

const { openingMaxPly, endgamePhaseUnitThreshold } = CONFIG.phaseSegmentation;

/**
 * Live, incremental phase classification for a bot's own move-selection
 * decision — deliberately NOT `phase-segmentation.ts`'s `phaseForPly`, which
 * resolves boundaries retrospectively from a finished game's full position
 * list. A bot must classify the position it's actually facing, one move at a
 * time, with only its own book depth (`bookPlies`) as a stand-in for
 * "how deep did book coverage run."
 *
 * Reuses the same material-based endgame boundary
 * (`phaseUnits`/`endgamePhaseUnitThreshold`) the coach's own phase-accuracy
 * dashboards are built on, so a bot's sense of "which phase is this" agrees
 * with the rest of the app's definition instead of inventing a second one.
 */
export function classifyBotGamePhase(fen: string, plyCount: number, bookPlies: number): MovePhase {
  if (phaseUnits(fen) <= endgamePhaseUnitThreshold) return 'endgame';

  const openingCeiling = Math.min(openingMaxPly, bookPlies * 2 + 4);
  if (plyCount < openingCeiling) return 'opening';

  return 'middlegame';
}
