import {
  DAILY_IMPORT_LIMIT,
  importAllowance,
  MAX_IN_FLIGHT_IMPORTS,
  WEEKLY_IMPORT_LIMIT,
  type ImportLimitKind,
  type ImportQuotaResponse
} from '@freechesscoach/shared';

/** What the reader is told when a limit stops an import. Numbers come from
 * the shared constants, never typed here, so the copy cannot disagree with
 * what the server enforces. */
const MESSAGES: Record<ImportLimitKind, string> = {
  daily: `Daily import limit reached (${DAILY_IMPORT_LIMIT} games/day)`,
  weekly: `Weekly import limit reached (${WEEKLY_IMPORT_LIMIT} games/week)`,
  in_flight: 'Finish analyzing your current games first — keep this tab open'
};

const ADVICE: Record<ImportLimitKind, string> = {
  daily: 'The cap rolls over continuously — you can import again once one of your imports passes the 24-hour mark.',
  weekly: 'The cap rolls over continuously — you can import again once one of your imports passes the 7-day mark.',
  in_flight: `Analysis only runs while this tab is open. Keep this tab open and you can import more once your current games (up to ${MAX_IN_FLIGHT_IMPORTS} at a time) finish.`
};

export function limitMessage(kind: ImportLimitKind): string {
  return MESSAGES[kind];
}

export function limitAdvice(kind: ImportLimitKind): string {
  return ADVICE[kind];
}

export interface SelectionLimit {
  /** How many games the picker will let the reader tick. */
  maxSelectable: number;
  /** Why the rest are disabled — the disabled rows' label. Null while nothing
   * is known to constrain the batch. */
  capReason: string | null;
}

/** How many games may be picked right now: the smallest headroom of the
 * daily, weekly and in-flight limits. Until the quota loads (or if it failed
 * to) a full batch is allowed — the server enforces the limits regardless. */
export function selectionLimit(quota: ImportQuotaResponse | undefined): SelectionLimit {
  if (!quota) return { maxSelectable: MAX_IN_FLIGHT_IMPORTS, capReason: null };

  const { remaining, blockedBy } = importAllowance({
    dailyUsed: quota.daily.used,
    weeklyUsed: quota.weekly.used,
    inFlight: quota.inFlight.used
  });
  if (blockedBy) return { maxSelectable: 0, capReason: limitMessage(blockedBy) };
  return { maxSelectable: remaining, capReason: `You can import ${remaining} more ${remaining === 1 ? 'game' : 'games'} right now` };
}
