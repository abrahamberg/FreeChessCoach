import {
  classifyMoves,
  findCandidateMoments,
  inBookWalk,
  isBrilliantSoundnessCandidate,
  type CandidateMoment,
  type MoveVerdict,
  type MoveVerdictDeps,
  type ParsedGame
} from '@freechesscoach/chess-analysis';
import type { BookReport, ClassifiedMoveDto, EngineEval, GameReport } from '@freechesscoach/shared';
import type { NewDiagnosticObservation } from '../db/repositories/diagnostic-observations.js';
import { buildBookReport } from './analysis-book-report.js';
import { isBrilliantSound } from './brilliant-soundness.js';
import { buildDiagnosticObservations } from './build-diagnostics.js';
import { buildGameReportForAnalysis } from './build-game-report.js';
import { annotatedPgnForReport } from './game-report.js';
import type { StepTimer } from './step-timer.js';
import { createPreventionScans, type OnPreventionScan } from './tactic-prevention.js';

export interface AnalysisStepsInput {
  gameId: string;
  userId: string;
  userColor: 'white' | 'black';
  userRating: number | null;
  pgn: string;
  pgnResult: string | null;
  parsedGame: ParsedGame;
  evals: EngineEval[];
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
 * access: classify → prevention → report → diagnostics → candidate moments.
 * Shared with `scripts/bench-analysis.ts` so the benchmark measures exactly
 * this sequence. Makes no engine calls: everything reads `input.evals`.
 */
export async function runAnalysisSteps(input: AnalysisStepsInput, timer: StepTimer, probes: AnalysisProbes = {}): Promise<AnalysisStepsResult> {
  const { parsedGame, evals } = input;
  const classifiedMoves = await timer.timed('classify', () => classifyGame(input));
  // Nothing is scanned here any more (Task 77.5): the scans run lazily, from
  // inside the report step, only for a move whose verdict still needs
  // `defusedThreat` — so their cost now shows up under `report`.
  const preventionScans = await timer.timed('prevention', () =>
    createPreventionScans(classifiedMoves, evals, probes.onPreventionScan)
  );

  const { bookReport, gameReport, annotatedPgn, verdicts } = await timer.timed('report', () => {
    const book = buildBookReport(parsedGame.positions);
    const { report, verdicts: decided } = buildGameReportForAnalysis({
      game: parsedGame,
      evals,
      moves: classifiedMoves,
      book,
      pgnResult: input.pgnResult,
      preventionScans,
      verdictDeps: probes.verdictDeps,
      userColor: input.userColor,
      userRating: input.userRating
    });
    // Annotated from the report's own moves, not `classifiedMoves` — see `annotatedPgnForReport`.
    return { bookReport: book, gameReport: report, annotatedPgn: annotatedPgnForReport(input.pgn, report), verdicts: decided };
  });

  const observations = await timer.timed('diagnostics', () =>
    buildObservationsSafely(input, gameReport.moves, verdicts, probes.onDetectorRun)
  );
  const candidateMoments = await timer.timed('candidateMoments', () => findCandidateMoments(gameReport.moves, evals));
  return { bookReport, gameReport, annotatedPgn, observations, candidateMoments, verdicts };
}

/** One classification pass: Brilliant candidates are re-classified in place
 * with their B6 soundness verdict (Task 77.3). */
function classifyGame(input: AnalysisStepsInput): ClassifiedMoveDto[] {
  const { parsedGame, evals, userColor } = input;
  const bookWalk = inBookWalk(parsedGame.positions);
  return classifyMoves(parsedGame, evals, userColor, {
    resolveBrilliantSoundness: (move) => brilliantSoundnessOf(move, evals, bookWalk)
  });
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

/** Task 50.3: `isBrilliantMove` sees `brilliantSoundness === undefined` (its
 * fail-closed default) unless this answers. Cheap-gate candidates
 * (typically 0-2 per game) are judged on §5.5's B6 from the stored eval of
 * the position after the move, `evals[move.ply]` (Task 77.2); every other
 * move gets `undefined` and keeps its first classification. */
function brilliantSoundnessOf(
  move: ClassifiedMoveDto,
  evals: EngineEval[],
  bookWalk: ReturnType<typeof inBookWalk>
): boolean | undefined {
  const candidate = brilliantSoundnessCandidate(move, bookWalk);
  if (!candidate) return undefined;
  return isBrilliantSound(evalAt(evals, move.ply, candidate.fenAfter), candidate.mover, candidate.beforeWin);
}

/** `evals[index]`, but only when it really is `fen`'s eval. */
function evalAt(evals: EngineEval[], index: number, fen: string): EngineEval | undefined {
  const evalResult = evals[index];
  return evalResult?.fen === fen ? evalResult : undefined;
}

function brilliantSoundnessCandidate(
  move: ClassifiedMoveDto,
  bookWalk: ReturnType<typeof inBookWalk>
): { fenAfter: string; mover: 'white' | 'black'; beforeWin: number } | null {
  const { fenBefore, fenAfter, drop, winPctBefore, moveFlags } = move;
  if (fenBefore === undefined || fenAfter === undefined) return null;
  if (drop === undefined || winPctBefore === undefined || !moveFlags) return null;
  const isCandidate = isBrilliantSoundnessCandidate({
    fenBefore,
    fenAfter,
    moveSan: move.moveSan,
    mover: move.mover,
    isBookMove: bookWalk[move.ply - 1]?.classification === 'book',
    legalMoveCount: moveFlags.legalMoveCount,
    isCapture: moveFlags.isCapture,
    drop
  });
  return isCandidate ? { fenAfter, mover: move.mover, beforeWin: winPctBefore } : null;
}
