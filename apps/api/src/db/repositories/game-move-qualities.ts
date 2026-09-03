import type { Kysely } from 'kysely';
import type { DiagnosisCodeId, MoveQuality } from '@freechesscoach/shared';
import type { Database } from '../schema.js';

export interface GameMoveQualityRow {
  id: string;
  gameId: string;
  ply: number;
  moveSan: string;
  mover: 'white' | 'black';
  quality: MoveQuality;
  cpLoss: number;
  bestLineSan: string[];
  evalAfterCp: number;
  reasons: string[];
  diagnosisCodes: DiagnosisCodeId[];
  createdAt: Date;
}

export interface NewGameMoveQuality {
  gameId: string;
  ply: number;
  moveSan: string;
  mover: 'white' | 'black';
  quality: MoveQuality;
  cpLoss: number;
  bestLineSan: string[];
  evalAfterCp: number;
  reasons: string[];
  diagnosisCodes: DiagnosisCodeId[];
}

/** Play mode's live equivalent of the batch pipeline's analyses.classified_moves
 * — one row per move so undo can delete a single ply (see deleteByPly)
 * instead of rewriting a growing jsonb array. */
export function insert(db: Kysely<Database>, values: NewGameMoveQuality): Promise<GameMoveQualityRow> {
  return db
    .insertInto('gameMoveQualities')
    .values({
      ...values,
      bestLineSan: JSON.stringify(values.bestLineSan),
      reasons: JSON.stringify(values.reasons),
      diagnosisCodes: JSON.stringify(values.diagnosisCodes)
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function listByGameId(db: Kysely<Database>, gameId: string): Promise<GameMoveQualityRow[]> {
  return db
    .selectFrom('gameMoveQualities')
    .selectAll()
    .where('gameId', '=', gameId)
    .orderBy('ply', 'asc')
    .execute();
}

/** Play-mode undo (architecture.md §14): the removed move's quality row is
 * deleted so nothing downstream (the "game so far" renderer, check_position,
 * recall_move) ever references a move that no longer exists. */
export function deleteByPly(db: Kysely<Database>, gameId: string, ply: number): Promise<void> {
  return db
    .deleteFrom('gameMoveQualities')
    .where('gameId', '=', gameId)
    .where('ply', '=', ply)
    .execute()
    .then(() => undefined);
}

export function deleteByGameId(db: Kysely<Database>, gameId: string): Promise<void> {
  return db.deleteFrom('gameMoveQualities').where('gameId', '=', gameId).execute().then(() => undefined);
}

/** Play-vs-bot's timed-PGN feature: the previous move's timestamp, to compute
 * elapsed wall-clock time for the next mover's `{[%clk h:mm:ss]}` comment. */
export function findLatestByGameId(db: Kysely<Database>, gameId: string): Promise<GameMoveQualityRow | undefined> {
  return db
    .selectFrom('gameMoveQualities')
    .selectAll()
    .where('gameId', '=', gameId)
    .orderBy('ply', 'desc')
    .limit(1)
    .executeTakeFirst();
}
