import { Migrator, type Kysely, type MigrationProvider } from 'kysely';
import * as initial from './migrations/0001_initial.js';
import * as sessionSummary from './migrations/0002_session_summary.js';
import * as classifiedMoves from './migrations/0003_classified_moves.js';
import * as sessionAbandonedStatus from './migrations/0004_session_abandoned_status.js';
import * as sessionDebugSnapshot from './migrations/0005_session_debug_snapshot.js';
import * as episodeContext from './migrations/0006_episode_context.js';
import * as showEngineAnalysis from './migrations/0007_show_engine_analysis.js';
import * as positionEvaluations from './migrations/0008_position_evaluations.js';
import * as removeShowEngineAnalysis from './migrations/0009_remove_show_engine_analysis.js';
import * as playMode from './migrations/0010_play_mode.js';
import * as engineMode from './migrations/0011_engine_mode.js';
import * as positionEvaluationsTrust from './migrations/0012_position_evaluations_trust.js';
import * as subjectPly from './migrations/0013_subject_ply.js';
import * as coachPersona from './migrations/0014_coach_persona.js';
import * as bookReport from './migrations/0015_book_report.js';
import * as gameReport from './migrations/0016_game_report.js';
import * as moveReasons from './migrations/0017_move_reasons.js';
import * as ttsSettings from './migrations/0018_tts_settings.js';
import * as generalFemaleCoach from './migrations/0019_general_female_coach.js';
import * as playBotMode from './migrations/0020_play_bot_mode.js';
import * as botGameClock from './migrations/0021_bot_game_clock.js';
import * as chessApiEngineMode from './migrations/0022_chess_api_engine_mode.js';
import * as gameMetadata from './migrations/0023_game_metadata.js';
import * as userRating from './migrations/0024_user_rating.js';
import * as diagnostics from './migrations/0025_diagnostics.js';
import * as findingDiagnosis from './migrations/0026_finding_diagnosis.js';
import * as focusAreaDiagnosis from './migrations/0027_focus_area_diagnosis.js';
import * as puzzleAssignments from './migrations/0028_puzzle_assignments.js';
import * as puzzleSessions from './migrations/0029_puzzle_sessions.js';
import * as botMoveDiagnosisCodes from './migrations/0030_bot_move_diagnosis_codes.js';
import * as gameReviewTier from './migrations/0031_game_review_tier.js';
import * as annotatedPgn from './migrations/0032_annotated_pgn.js';
import * as gamesUserCreatedIndex from './migrations/0033_games_user_created_index.js';

const provider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      '0001_initial': initial,
      '0002_session_summary': sessionSummary,
      '0003_classified_moves': classifiedMoves,
      '0004_session_abandoned_status': sessionAbandonedStatus,
      '0005_session_debug_snapshot': sessionDebugSnapshot,
      '0006_episode_context': episodeContext,
      '0007_show_engine_analysis': showEngineAnalysis,
      '0008_position_evaluations': positionEvaluations,
      '0009_remove_show_engine_analysis': removeShowEngineAnalysis,
      '0010_play_mode': playMode,
      '0011_engine_mode': engineMode,
      '0012_position_evaluations_trust': positionEvaluationsTrust,
      '0013_subject_ply': subjectPly,
      '0014_coach_persona': coachPersona,
      '0015_book_report': bookReport,
      '0016_game_report': gameReport,
      '0017_move_reasons': moveReasons,
      '0018_tts_settings': ttsSettings,
      '0019_general_female_coach': generalFemaleCoach,
      '0020_play_bot_mode': playBotMode,
      '0021_bot_game_clock': botGameClock,
      '0022_chess_api_engine_mode': chessApiEngineMode,
      '0023_game_metadata': gameMetadata,
      '0024_user_rating': userRating,
      '0025_diagnostics': diagnostics,
      '0026_finding_diagnosis': findingDiagnosis,
      '0027_focus_area_diagnosis': focusAreaDiagnosis,
      '0028_puzzle_assignments': puzzleAssignments,
      '0029_puzzle_sessions': puzzleSessions,
      '0030_bot_move_diagnosis_codes': botMoveDiagnosisCodes,
      '0031_game_review_tier': gameReviewTier,
      '0032_annotated_pgn': annotatedPgn,
      '0033_games_user_created_index': gamesUserCreatedIndex
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
