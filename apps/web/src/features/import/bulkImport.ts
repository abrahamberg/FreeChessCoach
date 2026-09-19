import { ImportGameRequestSchema, ImportGameResponseSchema } from '@freechesscoach/shared';
import { apiPost, ApiError } from '../../api/client.js';
import type { BulkResult, RemoteTab } from './RemoteImportPanel.js';

export interface BulkImportArgs {
  games: { id: string; pgn: string; playedAt: string | null }[];
  source: RemoteTab;
  /** Fires right after each game's own request settles (success or failure)
   * — lets the picker check off rows one at a time as they land instead of
   * sitting on a single frozen "Importing…" label until the whole batch (up
   * to 10 sequential requests) finishes. */
  onGameSettled: (gameId: string) => void;
}

/** Stat-bank bulk import (Task 31.4): imports each selected game, one request
 * per game (the API has no batch import endpoint), tolerating individual
 * failures so one rate-limited or malformed game doesn't lose the rest of
 * the batch. Shared by both remote pickers (Lichess, Chess.com) since the
 * only per-source difference is the `source` tag on the request body.
 *
 * No `deferAnalysis` here (unlike the on-demand `/api/games/:id/analyze`
 * re-analyze path GameRow's "Get coach analysis" button still uses for
 * older, already-deferred rows) — engine analysis has no AI/BYOK-unlock
 * dependency (services/analysis.ts), so there's no cost left to defer by
 * making the student click into every row by hand; every bulk-imported game
 * gets the same free engine pass a single-game import already does. */
export async function importForStatBank({ games, source, onGameSettled }: BulkImportArgs): Promise<BulkResult> {
  let succeeded = 0;
  let rateLimited = false;
  for (const game of games) {
    try {
      const body = ImportGameRequestSchema.parse({ pgn: game.pgn, source, playedAt: game.playedAt });
      await apiPost('/api/games', body, ImportGameResponseSchema);
      succeeded += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) rateLimited = true;
    }
    onGameSettled(game.id);
  }
  return { succeeded, total: games.length, rateLimited };
}
