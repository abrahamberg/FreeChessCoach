import type { Kysely } from 'kysely';
import type { DiagnosisCodeId, Direction, Severity } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface DiagnosticObservationRow {
  id: string;
  userId: string;
  gameId: string;
  ply: number;
  code: DiagnosisCodeId;
  direction: Direction;
  failed: boolean;
  hwdl: number;
  severity: Severity;
  reachability: number;
  detail: unknown;
  createdAt: Date;
}

export interface NewDiagnosticObservation {
  userId: string;
  gameId: string;
  ply: number;
  code: DiagnosisCodeId;
  direction: Direction;
  failed: boolean;
  hwdl: number;
  severity: Severity;
  reachability: number;
  detail: unknown;
}

/** One row per `DiagnosticEntry` the detector registry + episode resolution
 * produced for a game (Task 56.3). Batched via Kysely's array-values insert
 * — a game analysis emits many entries at once, never one at a time. */
export function insertMany(db: Kysely<Database>, observations: readonly NewDiagnosticObservation[]): Promise<void> {
  if (observations.length === 0) return Promise.resolve();
  return db
    .insertInto('diagnosticObservations')
    .values(observations.map((o) => ({ ...o, detail: o.detail === null ? null : JSON.stringify(o.detail) })))
    .execute()
    .then(() => undefined);
}

/** Every observation for `userId` from `since` onward — the profile
 * rebuild job's (Task 56.4) input to `buildDiagnosticProfile`. */
export function listForUserSince(db: Kysely<Database>, userId: string, since: Date): Promise<DiagnosticObservationRow[]> {
  return db
    .selectFrom('diagnosticObservations')
    .selectAll()
    .where('userId', '=', userId)
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'asc')
    .execute();
}

/** One game's observations — the Task 58.1 evidence drill-down. */
export function listForGame(db: Kysely<Database>, gameId: string): Promise<DiagnosticObservationRow[]> {
  return db.selectFrom('diagnosticObservations').selectAll().where('gameId', '=', gameId).orderBy('ply', 'asc').execute();
}

/** Wired into services/games.ts's deleteGameForUser cascade alongside
 * analysesRepo.deleteByGameId — no DB-level ON DELETE CASCADE (see
 * 0025_diagnostics.ts), so this must run inside that same transaction. */
export function deleteByGameId(db: Kysely<Database>, gameId: string): Promise<void> {
  return db.deleteFrom('diagnosticObservations').where('gameId', '=', gameId).execute().then(() => undefined);
}
