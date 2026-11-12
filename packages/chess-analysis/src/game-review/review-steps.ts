import type { BookReport, ClassifiedMoveDto, EngineEval, GameReport } from '@freechesscoach/shared';
import { classifyMoves } from '../classify.js';
import { isBrilliantSoundnessCandidate } from '../classify-brilliant.js';
import { withMoveStories } from '../move-story.js';
import type { MoveVerdictDeps } from '../move-verdict/deps.js';
import type { MoveVerdict } from '../move-verdict/types.js';
import { inBookWalk } from '../opening-book.js';
import type { ParsedGame } from '../pgn.js';
import { annotatedPgnForReport } from './annotated-report.js';
import { buildBookReport } from './book-report.js';
import { isBrilliantSound } from './brilliant-soundness.js';
import { createPreventionScans, type OnPreventionScan } from './prevention-scans.js';
import { buildGameReportForAnalysis } from './report-for-game.js';

/** What Game Review needs besides the engine's evals: the game and whose it is. */
export interface GameReviewInput {
  userColor: 'white' | 'black';
  /** The player's own rating when known (the PGN's Elo tags win anyway). */
  userRating: number | null;
  /** The game's plain PGN, headers and mainline. */
  pgn: string;
  /** The PGN `Result` header, or null. */
  pgnResult: string | null;
  parsedGame: ParsedGame;
  /** One eval per position of `parsedGame`, Brilliant candidates widened. */
  evals: EngineEval[];
  /** Plies whose "the engine's move was better" notes the deep check did not
   * confirm (`deep-comparison.ts` in the api); unset when the check is off. */
  refutedComparisonPlies?: ReadonlySet<number>;
}

export interface GameReview {
  bookReport: BookReport;
  /** The report with every move's classification, notes and story. */
  gameReport: GameReport;
  /** The PGN with the report's moves written into its comments. */
  annotatedPgn: string;
  /** Each move's one tactical verdict by ply. */
  verdicts: Map<number, MoveVerdict | null>;
}

/**
 * Game Review's classification pass, with no I/O: Brilliant candidates are
 * re-classified in place with their B6 soundness verdict (Task 77.3). The
 * server's analysis job and the no-account review in the browser both run
 * it, so a game gets the same verdicts wherever its engine ran.
 */
export function classifyGameMoves(input: GameReviewInput): ClassifiedMoveDto[] {
  const { parsedGame, evals, userColor } = input;
  const bookWalk = inBookWalk(parsedGame.positions);
  return classifyMoves(parsedGame, evals, userColor, {
    refutedComparisonPlies: input.refutedComparisonPlies,
    resolveBrilliantSoundness: (move) => brilliantSoundnessOf(move, evals, bookWalk)
  });
}

/**
 * The report step after `classifyGameMoves`: the opening book, the Game
 * Report with its verdicts and worded notes, each move's story, and the
 * annotated PGN. Makes no engine call: everything reads `input.evals`. The
 * prevention scans run lazily inside it, only for a move whose verdict still
 * needs `defusedThreat` (Task 77.5).
 */
export function buildGameReview(
  input: GameReviewInput,
  classifiedMoves: ClassifiedMoveDto[],
  probes: { verdictDeps?: MoveVerdictDeps; onPreventionScan?: OnPreventionScan } = {}
): GameReview {
  const { parsedGame, evals } = input;
  const preventionScans = createPreventionScans(classifiedMoves, evals, probes.onPreventionScan);
  const bookReport = buildBookReport(parsedGame.positions);
  const { report: built, verdicts } = buildGameReportForAnalysis({
    game: parsedGame,
    evals,
    moves: classifiedMoves,
    book: bookReport,
    pgnResult: input.pgnResult,
    preventionScans,
    verdictDeps: probes.verdictDeps,
    userColor: input.userColor,
    userRating: input.userRating
  });
  // Each move's story from the finished moves (cards attached): what the page renders (`docs/move-story.md`).
  const gameReport = { ...built, moves: withMoveStories(built.moves, parsedGame.positions.map((position) => position.fen), evals) };
  // Annotated from the report's own moves, not `classifiedMoves` — see `annotatedPgnForReport`.
  return { bookReport, gameReport, annotatedPgn: annotatedPgnForReport(input.pgn, gameReport), verdicts };
}

/** Task 50.3: `isBrilliantMove` sees `brilliantSoundness === undefined` (its
 * fail-closed default) unless this answers. Cheap-gate candidates
 * (typically 0-2 per game) are judged on §5.5's B6 from the stored eval of
 * the position after the move, `evals[move.ply]` (Task 77.2); every other
 * move gets `undefined` and keeps its first classification. */
function brilliantSoundnessOf(move: ClassifiedMoveDto, evals: EngineEval[], bookWalk: ReturnType<typeof inBookWalk>): boolean | undefined {
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
