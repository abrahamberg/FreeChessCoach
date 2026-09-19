import { z } from 'zod';
import { MAX_DELETE_EARLIEST_IMPORTED } from './game.js';

/** Import limits, shared with the web UI so copy never says one number while
 * the server enforces another. The daily and weekly windows are rolling
 * (last 24h / last 7×24h) and count imports *made* — deleting a game never
 * frees quota. */
export const DAILY_IMPORT_LIMIT = 30;
export const WEEKLY_IMPORT_LIMIT = 150;
/** Games imported whose analysis has not finished yet (queued, running,
 * planning, or paused because the browser tab is not connected). */
export const MAX_IN_FLIGHT_IMPORTS = 10;
/** Imported games a user may hold; the next import past this auto-deletes
 * the `AUTO_DELETE_BATCH` earliest ones first. */
export const MAX_LIBRARY_GAMES = 1000;
/** Tied to the manual "delete earliest" cap so the two can never disagree. */
export const AUTO_DELETE_BATCH = MAX_DELETE_EARLIEST_IMPORTED;

/** Which limit blocked an import — the 429 body's `limit` field. */
export const ImportLimitKindSchema = z.enum(['daily', 'weekly', 'in_flight']);
export type ImportLimitKind = z.infer<typeof ImportLimitKindSchema>;

const UsageSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive()
});

/** GET /api/games/import-quota: every limit in one object so the UI makes one
 * request. `library.autoDeleteCount` is how many earliest games the *next*
 * import would delete (0 while under the cap). */
export const ImportQuotaResponseSchema = z.object({
  daily: UsageSchema,
  weekly: UsageSchema,
  inFlight: UsageSchema,
  library: UsageSchema.extend({ autoDeleteCount: z.number().int().nonnegative() })
});
export type ImportQuotaResponse = z.infer<typeof ImportQuotaResponseSchema>;
