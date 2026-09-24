import {
  canPromoteGameReviewTier,
  type DeleteEarliestImportedResponse,
  type GameListResponse,
  type GameReviewTier,
  type ImportedGamesPage,
  type ImportedGamesQuery
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as diagnosticObservationsRepo from '../db/repositories/diagnostic-observations.js';
import * as findingsRepo from '../db/repositories/findings.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { GameListRow } from '../db/repositories/games.js';
import * as sessionMessagesRepo from '../db/repositories/session-messages.js';
import * as sessionMoveNotesRepo from '../db/repositories/session-move-notes.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { sinceFor } from '../lib/range-since.js';
import { bankGameStats } from './stats-archive.js';

/** design.md §4.1 / architecture §14: Games (home) list — one row per game
 * with its analysis status for the status chip, or (for a play-mode game)
 * its still-resumable session id so the row can link straight back into an
 * in-progress game instead of showing a stuck "analyzing…" chip — a
 * coach_play game never gets an `analyses` row, so analysisStatus is always
 * null for it. SQL lives in the repository only. */
export async function listGamesForUser(db: Kysely<Database>, userId: string): Promise<GameListResponse> {
  const rows = await gamesRepo.listByUserWithStatus(db, userId);
  return Promise.all(rows.map((row) => toListItem(db, userId, row)));
}

/** Games page: "Recently imported" (first 15) and Find games (20 at a time)
 * — imported games only, newest import first, optionally narrowed by time
 * range and the user's own per-game estimated rating. */
export async function listImportedGamesForUser(
  db: Kysely<Database>,
  userId: string,
  query: ImportedGamesQuery
): Promise<ImportedGamesPage> {
  const filter = {
    since: sinceFor(query.range, new Date()),
    minRating: query.minRating ?? null,
    maxRating: query.maxRating ?? null
  };
  const { rows, hasMore } = await gamesRepo.listImportedPage(db, userId, filter, {
    limit: query.limit,
    offset: query.offset
  });
  const items = await Promise.all(
    rows.map(async (row) => ({ ...(await toListItem(db, userId, row)), estimatedRating: row.estimatedRating }))
  );
  return { items, hasMore };
}

/** Games page "Continue": play-mode games that still have a live session. */
export async function listInProgressGamesForUser(db: Kysely<Database>, userId: string): Promise<GameListResponse> {
  const rows = await gamesRepo.listPlayModeByUser(db, userId);
  const items = await Promise.all(rows.map((row) => toListItem(db, userId, row)));
  return items.filter((item) => item.sessionId !== null);
}

/** "Delete earliest 50": removes the user's `count` earliest-imported games
 * (and everything hanging off them) in one transaction — all or nothing, so
 * a mid-cascade failure can't leave a half-deleted batch. */
export async function deleteEarliestImportedGames(
  db: Kysely<Database>,
  userId: string,
  count: number
): Promise<DeleteEarliestImportedResponse> {
  return db.transaction().execute((trx) => deleteEarliestImportedInTransaction(trx, userId, count));
}

/** The body of `deleteEarliestImportedGames` for a caller that already owns
 * the transaction (Kysely cannot nest one) — the import's automatic
 * make-room-at-1000 step runs it inside the same transaction as the insert. */
export async function deleteEarliestImportedInTransaction(
  trx: Kysely<Database>,
  userId: string,
  count: number
): Promise<DeleteEarliestImportedResponse> {
  const gameIds = await gamesRepo.listEarliestImportedIds(trx, userId, count);
  for (const gameId of gameIds) await deleteGameKeepingStats(trx, userId, gameId);
  return { deleted: gameIds.length };
}

/** The per-game delete cascade — none of the foreign keys involved are ON
 * DELETE CASCADE (see migrations 0001/0006/0010/0025), so dependents must go
 * first: session_messages/session_move_notes for each of the game's
 * sessions, then sessions, then findings/analyses/diagnostic_observations (findings also by session),
 * then the game itself. `annotatedPgn` — where all of a game's per-move
 * analysis now lives (0032_annotated_pgn.ts) — needs no separate delete:
 * it's a column on the game row itself, gone the moment `gamesRepo.remove`
 * runs. Shared by `deleteGameForUser` below and services/account.ts's
 * full-account deletion; the caller owns the transaction. */
export async function cascadeDeleteGame(db: Kysely<Database>, gameId: string): Promise<void> {
  const sessionIds = await sessionsRepo.listIdsByGameId(db, gameId);
  for (const sessionId of sessionIds) {
    await sessionMessagesRepo.deleteBySessionId(db, sessionId);
    await sessionMoveNotesRepo.deleteBySessionId(db, sessionId);
    // Findings can point at the session without carrying this game's id, so
    // deleteByGameId below would miss them and the session delete would fail.
    await findingsRepo.deleteBySessionId(db, sessionId);
  }
  await sessionsRepo.deleteByGameId(db, gameId);
  await findingsRepo.deleteByGameId(db, gameId);
  await analysesRepo.deleteByGameId(db, gameId);
  await diagnosticObservationsRepo.deleteByGameId(db, gameId);
  await gamesRepo.remove(db, gameId);
}

/** Deletes a game after folding its stats into the weekly archive
 * (`bankGameStats`), so the Stats page does not change. Every deletion of an
 * imported game must go through this; only account deletion — which removes
 * the archive too — calls bare `cascadeDeleteGame`. The caller owns the
 * transaction. */
export async function deleteGameKeepingStats(db: Kysely<Database>, userId: string, gameId: string): Promise<void> {
  await bankGameStats(db, userId, gameId);
  await cascadeDeleteGame(db, gameId);
}

/** Deletes a game and everything that hangs off it (`deleteGameKeepingStats`),
 * wrapped in a transaction so a mid-cascade failure can't leave orphaned
 * rows. */
export async function deleteGameForUser(db: Kysely<Database>, gameId: string, userId: string): Promise<void> {
  const game = await gamesRepo.findByIdForUser(db, gameId, userId);
  if (!game) throw new NotFoundError('Game not found');

  await db.transaction().execute((trx) => deleteGameKeepingStats(trx, userId, gameId));
}

/** The still-live session mode a `coach_play`/`vs_bot` game's row links back
 * into — null for every other source, which never has a session of its own
 * to resume. Distinct from a game's `reviewTier`: a finished `vs_bot` game
 * promoted to the Coach tier gets a brand-new 'analyze' session, but this
 * row should still only ever surface its 'play_bot' one (if still active),
 * never that unrelated analyze session — see findActiveByGameIdForUser's
 * doc comment. */
function liveSessionModeFor(source: GameListRow['source']): 'play' | 'play_bot' | null {
  if (source === 'coach_play') return 'play';
  if (source === 'vs_bot') return 'play_bot';
  return null;
}

async function toListItem(db: Kysely<Database>, userId: string, row: GameListRow) {
  const liveSessionMode = liveSessionModeFor(row.source);
  const sessionId = liveSessionMode
    ? ((await sessionsRepo.findActiveByGameIdForUser(db, row.id, userId, liveSessionMode))?.id ?? null)
    : null;
  return {
    id: row.id,
    source: row.source,
    userColor: row.userColor,
    whiteName: row.whiteName,
    blackName: row.blackName,
    result: row.result,
    timeControl: row.timeControl,
    playedAt: row.playedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    analysisStatus: row.analysisStatus,
    sessionId,
    botId: row.botId,
    reviewTier: row.reviewTier
  };
}

/** The Games page's "move up the stack" action (imported/bot -> review or
 * coach, review -> coach). Gated on a ready analysis — every tier above a
 * game's starting one exists to look at a Game Report that doesn't exist
 * until analysis completes, unlike `coach_play`, which starts at `coach`
 * without ever needing one (architecture §14). */
export async function promoteGame(
  db: Kysely<Database>,
  userId: string,
  gameId: string,
  targetTier: GameReviewTier
): Promise<GameReviewTier> {
  const game = await gamesRepo.findByIdForUser(db, gameId, userId);
  if (!game) throw new NotFoundError('Game not found');
  if (!canPromoteGameReviewTier(game.reviewTier, targetTier)) {
    throw new ValidationError(`Cannot promote a game from '${game.reviewTier}' to '${targetTier}'`);
  }

  const analysis = await analysesRepo.findByGameId(db, gameId);
  if (analysis?.status !== 'ready') {
    throw new ValidationError('This game needs a completed analysis before it can be promoted');
  }

  await gamesRepo.updateReviewTier(db, gameId, targetTier);
  return targetTier;
}
