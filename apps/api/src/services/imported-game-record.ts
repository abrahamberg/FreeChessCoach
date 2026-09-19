import { classifyTimeControl, extractPgnMoveComments, parseGameHeaders } from '@freechesscoach/chess-analysis';
import { AUTO_DELETE_BATCH, MAX_LIBRARY_GAMES, type ImportGameRequest, type PlayerColor } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as gameImportEventsRepo from '../db/repositories/game-import-events.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { deleteEarliestImportedInTransaction } from './games.js';

type NewGame = Parameters<typeof gamesRepo.insert>[1];

export function buildGameValues(
  userId: string,
  request: ImportGameRequest,
  headers: Record<string, string>,
  userColor: PlayerColor
): NewGame {
  const timeControl = headers['TimeControl'] ?? null;
  const headerMetadata = parseGameHeaders(headers);
  return {
    userId,
    pgn: request.pgn,
    source: request.source,
    userColor,
    whiteName: headers['White'] ?? null,
    blackName: headers['Black'] ?? null,
    result: headers['Result'] ?? null,
    timeControl,
    eco: headers['ECO'] ?? null,
    playedAt: parsePlayedAt(headers) ?? parseClientPlayedAt(request.playedAt),
    whiteElo: headerMetadata.whiteElo,
    blackElo: headerMetadata.blackElo,
    ratingsProvisional: headerMetadata.ratingsProvisional,
    rated: headerMetadata.rated,
    termination: headerMetadata.termination,
    variant: headerMetadata.variant,
    speed: classifyTimeControl(timeControl),
    playedAtTime: headerMetadata.utcTime,
    // Always the (possibly empty) array, never null — null is reserved for
    // "not yet processed by this metadata pipeline" (see
    // gamesRepo.findBatchMissingMoveTimes's doc comment), and this pipeline
    // just ran, right here.
    moveTimes: extractPgnMoveComments(request.pgn)
  };
}

/** Everything a new import writes, in one transaction: make room if the
 * library is full, insert the game, append the import-ledger row. So a
 * failed insert neither burns quota nor deletes anything, and a ledger row
 * never exists without its game (deleting the game later leaves the row —
 * that is the point). */
export function recordImportedGame(db: Kysely<Database>, values: NewGame) {
  return db.transaction().execute(async (trx) => {
    await makeRoomInLibrary(trx, values.userId);
    const game = await gamesRepo.insert(trx, values);
    await gameImportEventsRepo.record(trx, values.userId, new Date());
    return game;
  });
}

/** At the library cap the `AUTO_DELETE_BATCH` earliest imported games are
 * deleted (their stats are banked — `deleteGameKeepingStats`) before the new
 * one lands. Imported sources only; bot and coach games are never counted or
 * deleted. The UI warns first (`ImportQuotaResponse.library.autoDeleteCount`). */
async function makeRoomInLibrary(trx: Kysely<Database>, userId: string): Promise<void> {
  const held = await gamesRepo.countImportableForUser(trx, userId);
  if (held < MAX_LIBRARY_GAMES) return;
  await deleteEarliestImportedInTransaction(trx, userId, AUTO_DELETE_BATCH);
}

/** Parses a PGN `Date`/`UTCDate` header (strict "YYYY.MM.DD"); anything else
 * (missing, partial like "2024.??.??") is treated as unknown. */
function parsePlayedAt(headers: Record<string, string>): Date | null {
  const raw = headers['UTCDate'] ?? headers['Date'];
  if (!raw || !/^\d{4}\.\d{2}\.\d{2}$/.test(raw)) return null;
  const iso = raw.replaceAll('.', '-');
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `request.playedAt`'s fallback half of `parsePlayedAt(headers) ??
 * parseClientPlayedAt(...)` above — an ISO string the client already
 * resolved from a remote API, so this only needs to guard against a missing
 * or malformed value, not parse a chess-PGN date format. */
function parseClientPlayedAt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
