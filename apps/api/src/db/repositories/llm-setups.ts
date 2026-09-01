import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface LlmSetupRow {
  userId: string;
  setupCiphertext: Buffer;
  setupIv: Buffer;
  setupSalt: Buffer;
  createdAt: Date;
}

export function upsert(
  db: Kysely<Database>,
  userId: string,
  setupCiphertext: Buffer,
  setupIv: Buffer,
  setupSalt: Buffer
): Promise<void> {
  return db
    .insertInto('userLlmSetups')
    .values({ userId, setupCiphertext, setupIv, setupSalt })
    .onConflict((oc) => oc.column('userId').doUpdateSet({ setupCiphertext, setupIv, setupSalt }))
    .execute()
    .then(() => undefined);
}

export function remove(db: Kysely<Database>, userId: string): Promise<void> {
  return db.deleteFrom('userLlmSetups').where('userId', '=', userId).execute().then(() => undefined);
}

export function findByUser(db: Kysely<Database>, userId: string): Promise<LlmSetupRow | undefined> {
  return db.selectFrom('userLlmSetups').selectAll().where('userId', '=', userId).executeTakeFirst();
}
