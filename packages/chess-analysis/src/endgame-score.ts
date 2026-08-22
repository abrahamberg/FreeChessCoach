export type GameResultForColour = 'win' | 'draw' | 'loss';

const WINNING_THRESHOLD = 75;
const EQUAL_THRESHOLD = 45;

const CONVERSION_TABLE: Record<'winning' | 'equal' | 'worse', Record<GameResultForColour, number>> = {
  winning: { win: 100, draw: 40, loss: 0 },
  equal: { win: 100, draw: 75, loss: 35 },
  worse: { win: 100, draw: 90, loss: 60 }
};

/**
 * §7.4's conversionScore: did the colour convert (or hold, or lose) the
 * position they actually had once the endgame started, from their own
 * win% at `endgameStartPly`.
 */
export function conversionScore(winPctAtEndgameStart: number, result: GameResultForColour): number {
  const bucket = standingBucket(winPctAtEndgameStart);
  return CONVERSION_TABLE[bucket][result];
}

function standingBucket(winPct: number): 'winning' | 'equal' | 'worse' {
  if (winPct >= WINNING_THRESHOLD) return 'winning';
  if (winPct >= EQUAL_THRESHOLD) return 'equal';
  return 'worse';
}

const ENDGAME_ACCURACY_WEIGHT = 0.7;
const CONVERSION_WEIGHT = 0.3;

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
