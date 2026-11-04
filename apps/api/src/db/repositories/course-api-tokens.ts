import type { Kysely, Selectable } from 'kysely';
import type { CourseApiTokensTable, Database } from '../schema.js';

export type CourseApiTokenRow = Selectable<CourseApiTokensTable>;

export function insert(db: Kysely<Database>, values: { userId: string; name: string; tokenHash: string }): Promise<CourseApiTokenRow> {
  return db.insertInto('courseApiTokens').values(values).returningAll().executeTakeFirstOrThrow();
}

/** The user's tokens that still work, newest first. */
export function listActiveForUser(db: Kysely<Database>, userId: string): Promise<CourseApiTokenRow[]> {
  return db.selectFrom('courseApiTokens').selectAll().where('userId', '=', userId).where('revokedAt', 'is', null).orderBy('createdAt', 'desc').execute();
}

/** Only the user's own token; false when there is none to revoke. */
export async function revoke(db: Kysely<Database>, id: string, userId: string): Promise<boolean> {
  const result = await db.updateTable('courseApiTokens').set({ revokedAt: new Date() }).where('id', '=', id).where('userId', '=', userId).where('revokedAt', 'is', null).executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/** The editor a token belongs to, while the token is not revoked and the
 * user may still edit courses; undefined otherwise. */
export function findEditorByHash(db: Kysely<Database>, tokenHash: string): Promise<{ tokenId: string; email: string; displayName: string } | undefined> {
  return db
    .selectFrom('courseApiTokens')
    .innerJoin('users', 'users.id', 'courseApiTokens.userId')
    .select(['courseApiTokens.id as tokenId', 'users.email', 'users.displayName'])
    .where('courseApiTokens.tokenHash', '=', tokenHash)
    .where('courseApiTokens.revokedAt', 'is', null)
    .where('users.canEditCourses', '=', true)
    .executeTakeFirst();
}

export async function touch(db: Kysely<Database>, id: string, at: Date): Promise<void> {
  await db.updateTable('courseApiTokens').set({ lastUsedAt: at }).where('id', '=', id).execute();
}
