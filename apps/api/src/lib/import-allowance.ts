import {
  DAILY_IMPORT_LIMIT,
  MAX_IN_FLIGHT_IMPORTS,
  WEEKLY_IMPORT_LIMIT,
  type ImportLimitKind
} from '@freechesscoach/shared';

export interface ImportUsage {
  dailyUsed: number;
  weeklyUsed: number;
  inFlight: number;
}

export interface ImportAllowance {
  /** How many more games may be imported right now. */
  remaining: number;
  /** The limit that is exhausted, or null while `remaining > 0`. */
  blockedBy: ImportLimitKind | null;
}

/** Listed most-actionable first: in-flight clears in minutes, daily in hours,
 * weekly in days. Ties (several limits exhausted at once) name the first. */
function headrooms(usage: ImportUsage): Array<[ImportLimitKind, number]> {
  return [
    ['in_flight', MAX_IN_FLIGHT_IMPORTS - usage.inFlight],
    ['daily', DAILY_IMPORT_LIMIT - usage.dailyUsed],
    ['weekly', WEEKLY_IMPORT_LIMIT - usage.weeklyUsed]
  ];
}

export function importAllowance(usage: ImportUsage): ImportAllowance {
  const remaining = Math.max(0, Math.min(...headrooms(usage).map(([, room]) => room)));
  if (remaining > 0) return { remaining, blockedBy: null };
  const [blockedBy] = headrooms(usage).find(([, room]) => room <= 0) ?? [null];
  return { remaining, blockedBy };
}
