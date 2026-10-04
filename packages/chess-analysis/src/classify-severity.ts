import type { MoveClassificationInput, SeverityQuality } from './classify-context.js';
import { CONFIG } from './config.js';

const SEVERITY_ORDER: readonly SeverityQuality[] = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
const {
  excellentMaxDrop: EXCELLENT_MAX_DROP,
  goodMaxDrop: GOOD_MAX_DROP,
  inaccuracyMaxDrop: INACCURACY_MAX_DROP,
  mistakeMaxDrop: MISTAKE_MAX_DROP,
  dampingHighWin: DAMPING_HIGH_WIN,
  dampingLowWin: DAMPING_LOW_WIN,
  deadDrawWinLow: DEAD_DRAW_WIN_LOW,
  deadDrawWinHigh: DEAD_DRAW_WIN_HIGH,
  deadDrawCpAbs: DEAD_DRAW_CP_ABS
} = CONFIG.severity;
const {
  losingMax: LOSING_MAX,
  worseMax: WORSE_MAX,
  slightlyWorseMax: SLIGHTLY_WORSE_MAX,
  equalMax: EQUAL_MAX,
  slightlyBetterMax: SLIGHTLY_BETTER_MAX,
  betterMax: BETTER_MAX
} = CONFIG.resultBand;

/** Applies §5.2's drop thresholds followed by §5.3's position damping. */
export function classifySeverity(input: Pick<MoveClassificationInput, 'drop' | 'beforeWin' | 'afterWin' | 'cpBefore' | 'cpAfter' | 'mover'>): SeverityQuality {
  const base = baseSeverity(input.drop);
  const decided = (input.beforeWin >= DAMPING_HIGH_WIN && input.afterWin >= DAMPING_HIGH_WIN) || (input.beforeWin <= DAMPING_LOW_WIN && input.afterWin <= DAMPING_LOW_WIN);
  if (decided) return worstSeverity(capSeverity(base, 'inaccuracy'), decidedSeverity(input));
  if (isDeadDrawTechnicalPosition(input)) return capSeverity(base, 'good');
  return base;
}

/** In a decided game (either side past the damping win%) the win percentage
 * has flattened: a queen thrown away at +9 moves it from 99.3 to 98.8. The move
 * is judged by the centipawns it gave away, in the bands the bot's own
 * mistake judge uses (`CONFIG.botMistake`), so a hung piece or an allowed
 * mate is not "good" just because the game was already won (or lost). */
function decidedSeverity(input: Pick<MoveClassificationInput, 'cpBefore' | 'cpAfter' | 'mover'>): SeverityQuality {
  const { decidedMateScaleCp: MATE_SCALE } = CONFIG.severity;
  const loss = input.mover === 'white' ? input.cpBefore - input.cpAfter : input.cpAfter - input.cpBefore;
  const moverCp = input.mover === 'white' ? input.cpBefore : -input.cpBefore;
  const bothMates = Math.abs(input.cpBefore) >= MATE_SCALE && Math.abs(input.cpAfter) >= MATE_SCALE && Math.sign(input.cpBefore) === Math.sign(input.cpAfter);
  // Being mated a move sooner or later lost nothing. Mating slower did: the
  // fastest mate is the best one, 10 cp a move on the mate score.
  if (bothMates && moverCp < 0) return 'excellent';
  if (loss >= CONFIG.botMistake.decidedBlunderCpLoss) return 'blunder';
  if (loss >= CONFIG.botMistake.decidedMistakeCpLoss) return 'mistake';
  if (loss >= CONFIG.severity.decidedInaccuracyCpLoss) return 'inaccuracy';
  return 'excellent';
}

function worstSeverity(a: SeverityQuality, b: SeverityQuality): SeverityQuality {
  return SEVERITY_ORDER[Math.max(SEVERITY_ORDER.indexOf(a), SEVERITY_ORDER.indexOf(b))] ?? a;
}

export function baseSeverity(drop: number): SeverityQuality {
  if (drop < EXCELLENT_MAX_DROP) return 'excellent';
  if (drop < GOOD_MAX_DROP) return 'good';
  if (drop < INACCURACY_MAX_DROP) return 'inaccuracy';
  if (drop < MISTAKE_MAX_DROP) return 'mistake';
  return 'blunder';
}

export type ResultBand = 'losing' | 'worse' | 'slightly-worse' | 'equal' | 'slightly-better' | 'better' | 'winning';

export function resultBand(winPct: number): ResultBand {
  if (winPct <= LOSING_MAX) return 'losing';
  if (winPct <= WORSE_MAX) return 'worse';
  if (winPct <= SLIGHTLY_WORSE_MAX) return 'slightly-worse';
  if (winPct <= EQUAL_MAX) return 'equal';
  if (winPct <= SLIGHTLY_BETTER_MAX) return 'slightly-better';
  if (winPct <= BETTER_MAX) return 'better';
  return 'winning';
}

export function bandIndex(band: ResultBand): number {
  return ['losing', 'worse', 'slightly-worse', 'equal', 'slightly-better', 'better', 'winning'].indexOf(band);
}

function capSeverity(current: SeverityQuality, maximum: SeverityQuality): SeverityQuality {
  const currentIndex = SEVERITY_ORDER.indexOf(current);
  const maximumIndex = SEVERITY_ORDER.indexOf(maximum);
  return SEVERITY_ORDER[Math.min(currentIndex, maximumIndex)] ?? maximum;
}

function isDeadDrawTechnicalPosition(
  input: Pick<MoveClassificationInput, 'beforeWin' | 'afterWin' | 'cpBefore' | 'cpAfter'>
): boolean {
  return input.beforeWin >= DEAD_DRAW_WIN_LOW
    && input.beforeWin <= DEAD_DRAW_WIN_HIGH
    && input.afterWin >= DEAD_DRAW_WIN_LOW
    && input.afterWin <= DEAD_DRAW_WIN_HIGH
    && Math.abs(input.cpBefore) < DEAD_DRAW_CP_ABS
    && Math.abs(input.cpAfter) < DEAD_DRAW_CP_ABS;
}
