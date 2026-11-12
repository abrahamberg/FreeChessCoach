import type { Kysely, Selectable } from 'kysely';
import type { Database, GamesTable } from '../schema.js';

export type SharedGameRow = Selectable<GamesTable>;

/** The game's share token, if the owner shares it; undefined when the game
 * is not theirs. */
export async function findTokenForUser(db: Kysely<Database>, gameId: string, userId: string): Promise<{ shareToken: string | null } | undefined> {
  return db.selectFrom('games').select('shareToken').where('id', '=', gameId).where('userId', '=', userId).executeTakeFirst();
}

/** Sets the token only where none is set yet, so two clicks never make two
 * links; returns the token the game now has. */
export async function setTokenIfUnset(db: Kysely<Database>, gameId: string, userId: string, token: string): Promise<string | null> {
  await db.updateTable('games').set({ shareToken: token }).where('id', '=', gameId).where('userId', '=', userId).where('shareToken', 'is', null).execute();
  const row = await findTokenForUser(db, gameId, userId);
  return row?.shareToken ?? null;
}

/** Turns the link off; false when the game is not theirs. */
export async function clearToken(db: Kysely<Database>, gameId: string, userId: string): Promise<boolean> {
  const result = await db.updateTable('games').set({ shareToken: null }).where('id', '=', gameId).where('userId', '=', userId).executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/** The shared game behind a link, or undefined for a wrong or turned-off one. */
export function findByToken(db: Kysely<Database>, token: string): Promise<SharedGameRow | undefined> {
  return db.selectFrom('games').selectAll().where('shareToken', '=', token).executeTakeFirst();
}
