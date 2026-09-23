import { Migrator, type Kysely, type MigrationProvider } from 'kysely';
import * as consolidated from './migrations/0000_consolidated_initial.js';
import * as ttsBackendLocal from './migrations/0001_tts_backend_local.js';
import * as sessionMoveNoteDetail from './migrations/0002_session_move_note_detail.js';

const provider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      '0000_consolidated_initial': consolidated,
      '0001_tts_backend_local': ttsBackendLocal,
      '0002_session_move_note_detail': sessionMoveNoteDetail
    })
};

/** Runs all not-yet-applied migrations, in order. Throws if any migration fails. */
export async function migrateToLatest<DB>(db: Kysely<DB>): Promise<void> {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();

  const failed = results?.find((result) => result.status === 'Error');
  if (failed) throw new Error(`Migration failed: ${failed.migrationName}`);
  if (error) throw error instanceof Error ? error : new Error(String(error));
}