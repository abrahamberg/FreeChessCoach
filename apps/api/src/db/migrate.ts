import type { Kysely } from 'kysely';
import { Migrator, type MigrationProvider } from 'kysely/migration';
import * as consolidated from './migrations/0000_consolidated_initial.js';
import * as ttsBackendLocal from './migrations/0001_tts_backend_local.js';
import * as sessionMoveNoteDetail from './migrations/0002_session_move_note_detail.js';
import * as ttsBackendNative from './migrations/0003_tts_backend_native.js';
import * as ratedBackfill from './migrations/0004_rated_backfill.js';
import * as puzzleSessionDebugSnapshot from './migrations/0005_puzzle_session_debug_snapshot.js';
import * as analysisEngineEvals from './migrations/0006_analysis_engine_evals.js';
import * as dropDeepenAnalysisJobs from './migrations/0007_drop_deepen_analysis_jobs.js';
import * as userOnboarding from './migrations/0008_user_onboarding.js';
import * as bugReports from './migrations/0009_bug_reports.js';
import * as gameSourceFile from './migrations/0010_game_source_file.js';
import * as chessApiRateLimit from './migrations/0011_chess_api_rate_limit.js';

const provider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      '0000_consolidated_initial': consolidated,
      '0001_tts_backend_local': ttsBackendLocal,
      '0002_session_move_note_detail': sessionMoveNoteDetail,
      '0003_tts_backend_native': ttsBackendNative,
      '0004_rated_backfill': ratedBackfill,
      '0005_puzzle_session_debug_snapshot': puzzleSessionDebugSnapshot,
      '0006_analysis_engine_evals': analysisEngineEvals,
      '0007_drop_deepen_analysis_jobs': dropDeepenAnalysisJobs,
      '0008_user_onboarding': userOnboarding,
      '0009_bug_reports': bugReports,
      '0010_game_source_file': gameSourceFile,
      '0011_chess_api_rate_limit': chessApiRateLimit
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