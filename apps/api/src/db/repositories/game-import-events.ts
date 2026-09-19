import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

/** One row per new successful import — see 0041_game_import_events.ts. Never
 * keyed off `games`, so deleting a game cannot change any count here. */
export async function record(db: Kysely<Database>, userId: string, at: Date): Promise<void> {
  await db.insertInto('gameImportEvents').values({ userId, createdAt: at }).execute();
}

export async function countSince(db: Kysely<Database>, userId: string, since: Date): Promise<number> {
  const result = await db
    .selectFrom('gameImportEvents')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('userId', '=', userId)
    .where('createdAt', '>=', since)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** Account deletion only — the ledger is otherwise append-only. */
export async function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  await db.deleteFrom('gameImportEvents').where('userId', '=', userId).execute();
}
