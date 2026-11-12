import {
  buildGameReview,
  classifyGameMoves,
  findCandidateMoments,
  type CandidateMoment,
  type MoveVerdict,
  type MoveVerdictDeps,
  type OnPreventionScan,
  type ParsedGame,
  type PassEvals
} from '@freechesscoach/chess-analysis';
import type { BookReport, ClassifiedMoveDto, EngineEval, GameReport } from '@freechesscoach/shared';
import type { NewDiagnosticObservation } from '../db/repositories/diagnostic-observations.js';
import { buildDiagnosticObservations } from './build-diagnostics.js';
import type { StepTimer } from './step-timer.js';

export interface AnalysisStepsInput {
  gameId: string;
  userId: string;
  userColor: 'white' | 'black';
  userRating: number | null;
  pgn: string;
  pgnResult: string | null;
  parsedGame: ParsedGame;
  evals: EngineEval[];
  /** The pass scans (`pass-scan.ts`), by flipped position: for the steps that
   * ask whether the side to move is hurt by having to move. */
  passEvals: PassEvals;
  /** Plies whose "the engine's move was better" notes the deep check did not
   * confirm (`deep-comparison.ts`); unset when the check is off. */
  refutedComparisonPlies?: ReadonlySet<number>;
}

/** The benchmark's counters (Task 77.5); the job passes none. */
export interface AnalysisProbes {
  verdictDeps?: MoveVerdictDeps;
  onPreventionScan?: OnPreventionScan;
  onDetectorRun?: (code: string) => void;
}

export interface AnalysisStepsResult {
  bookReport: BookReport;
  gameReport: GameReport;
  annotatedPgn: string;
  /** Null when building them failed: diagnostics must never fail an
   * analysis (Task 56.3), so the failure is logged and the step skipped. */
  observations: NewDiagnosticObservation[] | null;
  candidateMoments: CandidateMoment[];
  /** Each move's one tactical verdict by ply. */
  verdicts: Map<number, MoveVerdict | null>;
}

/**
 * Everything `runAnalyzeGameJob` does after the engine pass, with no DB
 * access: classify → report (`classifyGameMoves` and `buildGameReview`, the
 * same steps the no-account review runs in the browser) → diagnostics →
 * candidate moments.
 * Shared with `scripts/bench-analysis.ts` so the benchmark measures exactly
 * this sequence. Makes no engine calls: everything reads `input.evals`.
 */
export async function runAnalysisSteps(input: AnalysisStepsInput, timer: StepTimer, probes: AnalysisProbes = {}): Promise<AnalysisStepsResult> {
  const { evals } = input;
  const classifiedMoves = await timer.timed('classify', () => classifyGameMoves(input));
  // The prevention scans run lazily inside the report step (Task 77.5), only
  // for a move whose verdict still needs `defusedThreat`.
  const { bookReport, gameReport, annotatedPgn, verdicts } = await timer.timed('report', () =>
    buildGameReview(input, classifiedMoves, { verdictDeps: probes.verdictDeps, onPreventionScan: probes.onPreventionScan })
  );
  const observations = await timer.timed('diagnostics', () =>
    buildObservationsSafely(input, gameReport.moves, verdicts, probes.onDetectorRun)
  );
  const candidateMoments = await timer.timed('candidateMoments', () => findCandidateMoments(gameReport.moves, evals));
  return { bookReport, gameReport, annotatedPgn, observations, candidateMoments, verdicts };
}

/** Task 56.3: diagnostics are isolated — a failure here loses the game's
 * observations, never the analysis. `buildDiagnosticObservations` also
 * isolates each individual detector. */
function buildObservationsSafely(
  input: AnalysisStepsInput,
  moves: ClassifiedMoveDto[],
  verdicts: ReadonlyMap<number, MoveVerdict | null>,
  onDetectorRun: AnalysisProbes['onDetectorRun']
): NewDiagnosticObservation[] | null {
  const { gameId, userId, userColor, pgn, evals } = input;
  try {
    return buildDiagnosticObservations({ gameId, userId, userColor, pgn, moves, evals, verdicts, onDetectorRun });
  } catch (error) {
    console.error(`diagnostic observation build failed for game ${gameId}:`, error);
    return null;
  }
}
