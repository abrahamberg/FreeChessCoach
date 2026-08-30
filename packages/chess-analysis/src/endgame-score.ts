import type { EndgameStanding } from '@freechesscoach/shared';
import { CONFIG } from './config.js';

export type { EndgameStanding } from '@freechesscoach/shared';
export type GameResultForColour = 'win' | 'draw' | 'loss';

const {
  winningThreshold: WINNING_THRESHOLD,
  equalThreshold: EQUAL_THRESHOLD,
  conversionTable: CONVERSION_TABLE,
  accuracyWeight: ENDGAME_ACCURACY_WEIGHT,
  conversionWeight: CONVERSION_WEIGHT
} = CONFIG.endgameScore;

/**
 * §7.4's conversionScore: did the colour convert (or hold, or lose) the
 * position they actually had once the endgame started, from their own
 * win% at `endgameStartPly`.
 */
export function conversionScore(winPctAtEndgameStart: number, result: GameResultForColour): number {
  const bucket = endgameStandingBucket(winPctAtEndgameStart);
  return CONVERSION_TABLE[bucket][result];
}

/** Which of the three §7.4 buckets a colour's win% at `endgameStartPly`
 * falls into — exported for the stats dashboard's "from equal/worse/better
 * positions" endgame breakdown (Phase 26), which groups games by this same
 * bucket rather than recomputing the thresholds itself. */
export function endgameStandingBucket(winPct: number): EndgameStanding {
  if (winPct >= WINNING_THRESHOLD) return 'winning';
  if (winPct >= EQUAL_THRESHOLD) return 'equal';
  return 'worse';
}

/**
 * §7.4's endgameScore. `null` when the game never reached the endgame phase
 * for this colour — signalled by either input being unavailable, since both
 * `phaseAccuracyEndgame` (Task 16.3) and `winPctAtEndgameStart` come from
 * the same `endgameStartPly` (Task 16.2), which is `null` in that case.
 */
export function endgameScore(
  phaseAccuracyEndgame: number | null,
  winPctAtEndgameStart: number | null,
  result: GameResultForColour
): number | null {
  if (phaseAccuracyEndgame === null || winPctAtEndgameStart === null) return null;
  return (
    ENDGAME_ACCURACY_WEIGHT * phaseAccuracyEndgame + CONVERSION_WEIGHT * conversionScore(winPctAtEndgameStart, result)
  );
}
