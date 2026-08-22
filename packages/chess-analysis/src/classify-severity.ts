import type { MoveClassificationInput, SeverityQuality } from './classify-context.js';

const SEVERITY_ORDER: readonly SeverityQuality[] = ['excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];

/** Applies §5.2's drop thresholds followed by §5.3's position damping. */
export function classifySeverity(input: Pick<MoveClassificationInput, 'drop' | 'beforeWin' | 'afterWin' | 'cpBefore' | 'cpAfter'>): SeverityQuality {
  const base = baseSeverity(input.drop);
  if (input.beforeWin >= 90 && input.afterWin >= 90) return capSeverity(base, 'inaccuracy');
  if (input.beforeWin <= 10 && input.afterWin <= 10) return capSeverity(base, 'inaccuracy');
  if (isDeadDrawTechnicalPosition(input)) return capSeverity(base, 'good');
  return base;
}

export function baseSeverity(drop: number): SeverityQuality {
  if (drop < 2) return 'excellent';
  if (drop < 5) return 'good';
  if (drop < 10) return 'inaccuracy';
  if (drop < 20) return 'mistake';
  return 'blunder';
}

export type ResultBand = 'losing' | 'worse' | 'slightly-worse' | 'equal' | 'slightly-better' | 'better' | 'winning';

export function resultBand(winPct: number): ResultBand {
  if (winPct <= 10) return 'losing';
  if (winPct <= 30) return 'worse';
  if (winPct <= 45) return 'slightly-worse';
  if (winPct <= 55) return 'equal';
  if (winPct <= 70) return 'slightly-better';
  if (winPct <= 90) return 'better';
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
  return input.beforeWin >= 45
    && input.beforeWin <= 55
    && input.afterWin >= 45
    && input.afterWin <= 55
    && Math.abs(input.cpBefore) < 30
    && Math.abs(input.cpAfter) < 30;
}
