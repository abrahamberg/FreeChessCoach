import { ImportGameRequestSchema, ImportGameResponseSchema, ImportLimitKindSchema, type ImportLimitKind } from '@freechesscoach/shared';
import { apiPost, ApiError } from '../../api/client.js';
import type { BulkResult, RemoteTab } from './RemoteImportPanel.js';

/** The `limit` field a 429 problem+json carries (which import limit tripped). */
function limitOf(error: unknown): ImportLimitKind | null {
  if (!(error instanceof ApiError) || error.status !== 429) return null;
  const parsed = ImportLimitKindSchema.safeParse((error.body as { limit?: unknown } | undefined)?.limit);
  return parsed.success ? parsed.data : null;
}

export interface BulkImportArgs {
  games: { id: string; pgn: string; playedAt: string | null }[];
  source: RemoteTab;
  /** Fires right after each game's own request settles (success or failure)
   * — lets the picker check off rows one at a time as they land instead of
   * sitting on a single frozen "Importing…" label until the whole batch (up
   * to 10 sequential requests) finishes. */
  onGameSettled: (gameId: string) => void;
}

/** Bulk import (Task 31.4): imports each selected game, one request
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
export async function importBatch({ games, source, onGameSettled }: BulkImportArgs): Promise<BulkResult> {
  const imported: BulkResult['games'] = [];
  let limit: ImportLimitKind | null = null;
  for (const game of games) {
    try {
      const body = ImportGameRequestSchema.parse({ pgn: game.pgn, source, playedAt: game.playedAt });
      const response = await apiPost('/api/games', body, ImportGameResponseSchema);
      imported.push({ gameId: response.gameId, analysisId: response.analysisId });
    } catch (error) {
      limit = limitOf(error) ?? limit;
    }
    onGameSettled(game.id);
  }
  return { succeeded: imported.length, total: games.length, limit, games: imported };
}
