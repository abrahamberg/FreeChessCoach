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
export function classifySeverity(input: Pick<MoveClassificationInput, 'drop' | 'beforeWin' | 'afterWin' | 'cpBefore' | 'cpAfter'>): SeverityQuality {
  const base = baseSeverity(input.drop);
  if (input.beforeWin >= DAMPING_HIGH_WIN && input.afterWin >= DAMPING_HIGH_WIN) return capSeverity(base, 'inaccuracy');
  if (input.beforeWin <= DAMPING_LOW_WIN && input.afterWin <= DAMPING_LOW_WIN) return capSeverity(base, 'inaccuracy');
  if (isDeadDrawTechnicalPosition(input)) return capSeverity(base, 'good');
  return base;
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
