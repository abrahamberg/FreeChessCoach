import { canPromoteGameReviewTier, type GameListResponse, type GameReviewTier } from '@freechesscoach/shared';
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

/** Deletes a game and everything that hangs off it — none of the foreign
 * keys involved are ON DELETE CASCADE (see migrations 0001/0006/0010/0025),
 * so dependents must go first: session_messages/session_move_notes for each
 * of the game's sessions, then sessions, then findings/analyses/
 * diagnostic_observations, then the game itself. `annotatedPgn` — where all
 * of a game's per-move analysis now lives (0032_annotated_pgn.ts) — needs no
 * separate delete: it's a column on the game row itself, gone the moment
 * `gamesRepo.remove` runs. Wrapped in a transaction so a mid-cascade failure
 * can't leave orphaned rows. */
export async function deleteGameForUser(db: Kysely<Database>, gameId: string, userId: string): Promise<void> {
  const game = await gamesRepo.findByIdForUser(db, gameId, userId);
  if (!game) throw new NotFoundError('Game not found');

  await db.transaction().execute(async (trx) => {
    const sessionIds = await sessionsRepo.listIdsByGameId(trx, gameId);
    for (const sessionId of sessionIds) {
      await sessionMessagesRepo.deleteBySessionId(trx, sessionId);
      await sessionMoveNotesRepo.deleteBySessionId(trx, sessionId);
    }
    await sessionsRepo.deleteByGameId(trx, gameId);
    await findingsRepo.deleteByGameId(trx, gameId);
    await analysesRepo.deleteByGameId(trx, gameId);
    await diagnosticObservationsRepo.deleteByGameId(trx, gameId);
    await gamesRepo.remove(trx, gameId);
  });
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
