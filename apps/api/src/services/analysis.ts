import {
  classifyMoves,
  findCandidateMoments,
  inBookWalk,
  enrichPositions,
  isBrilliantSoundnessCandidate,
  OPENING_BOOK_SOURCE,
  parsePgn,
  positionKey,
  repairEvalSignConvention,
  resolveOpening,
  type ParsedPosition
} from '@freechesscoach/chess-analysis';
import { TACTIC_MOTIF_LABELS } from '@freechesscoach/shared';
import type {
  BookReport,
  ClassifiedMoveDto,
  CoachingPlan,
  EngineEval,
  PlayerBookReport,
  PositionAnalysis,
  TacticMotifType
} from '@freechesscoach/shared';
import { buildPlannerMessages, type PlannerPromptInput } from '@freechesscoach/prompts';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { checkBrilliantSoundness } from './brilliant-soundness.js';
import { buildGameReportForAnalysis } from './build-game-report.js';
import { computeTacticMotifPrevented } from './tactic-prevention.js';

/** Positions per engine call. Small enough that the progress percentage moves
 * often, large enough not to pay per-request overhead on every ply — and it
 * keeps each browser-mode tunnel request comfortably inside its timeout. */
const ENGINE_CHUNK_POSITIONS = 6;

export interface PlannerMessages {
  system: string;
  user: string;
}

export interface AnalysisJobDependencies {
  /** Wraps `POST engine/analyze-game` (architecture §4). */
  analyzeGamePositions: (fens: string[]) => Promise<EngineEval[]>;
  /** Wraps a single-position analyze call — the same engine backend
   * `analyzeGamePositions` is built from. Used only by the tactics-prevented
   * gated fallback (`computeTacticMotifPrevented`'s Step B): one extra call
   * per game at most on a normal position, never per-ply. */
  analyzePosition: (fen: string) => Promise<PositionAnalysis>;
  /** Wraps the gateway's light-tier model call. The model is constrained to
   * CoachingPlanSchema by the provider, so this yields an already-valid plan
   * or throws — LLM output never reaches the DB unvalidated. */
  callPlanner: (messages: PlannerMessages) => Promise<CoachingPlan>;
}

/**
 * architecture §5 `analyze-game` job: engine_running -> (evals) -> planning ->
 * (validated plan) -> ready, or failed with `error` set on any step's failure.
 *
 * Findings/focus-areas aren't wired into the planner prompt yet — those repos
 * are Task 5.1's — so this passes empty history; `buildPlannerMessages` renders
 * that as its normal "(none yet…)" fallback, which is also just correct for a
 * user's first analyzed game.
 */
export async function runAnalyzeGameJob(
  db: Kysely<Database>,
  deps: AnalysisJobDependencies,
  gameId: string
): Promise<void> {
  const analysis = await analysesRepo.findByGameId(db, gameId);
  if (!analysis) throw new Error(`No analysis row for game ${gameId}`);

  try {
    await analysesRepo.updateStatus(db, analysis.id, 'engine_running');

    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new Error(`Game ${gameId} not found`);
    const user = await usersRepo.findById(db, game.userId);
    if (!user) throw new Error(`User ${game.userId} not found`);

    const parsedGame = parsePgn(game.pgn);
    const fens = parsedGame.positions.map((position) => position.fen);
    const evals = await analyzeInChunks(db, deps, analysis.id, fens);

    const brilliantSoundnessByPly = await resolveBrilliantSoundness(
      deps,
      classifyMoves(parsedGame, evals, game.userColor),
      inBookWalk(parsedGame.positions)
    );
    const unannotatedMoves = attachEnrichment(
      classifyMoves(parsedGame, evals, game.userColor, { brilliantSoundnessByPly }),
      enrichPositions(parsedGame.positions)
    );
    // Computed before storeClassifiedMoves (not after, as before) so its
    // per-ply byPly map can be attached onto the stored moves themselves —
    // the move-list UI's per-ply "prevented" indicator reads it straight off
    // ClassifiedMoveDto, the same way tacticOpportunity already does.
    const prevention = await computeTacticMotifPrevented(
      { analyzePosition: deps.analyzePosition },
      unannotatedMoves,
      evals
    );
    const classifiedMoves = attachTacticPrevention(unannotatedMoves, prevention.byPly);
    await analysesRepo.storeClassifiedMoves(db, analysis.id, classifiedMoves);
    const bookReport = buildBookReport(parsedGame.positions);
    await analysesRepo.storeBookReport(db, analysis.id, bookReport);
    const gameReport = buildGameReportForAnalysis({
      game: parsedGame,
      evals,
      moves: classifiedMoves,
      book: bookReport,
      pgnResult: game.result,
      preventedCounts: { white: prevention.counts.white.prevented, black: prevention.counts.black.prevented },
      preventableCounts: { white: prevention.counts.white.preventable, black: prevention.counts.black.preventable },
      userColor: game.userColor,
      userRating: user.rating
    });
    await analysesRepo.storeGameReport(db, analysis.id, gameReport);
    const candidateMoments = findCandidateMoments(classifiedMoves, evals);

    await analysesRepo.updateStatus(db, analysis.id, 'planning');

    const plannerInput: PlannerPromptInput = {
      band: user.ratingBand,
      focusAreas: [],
      recentFindings: [],
      selfAssessment: user.selfAssessment,
      userColor: game.userColor,
      moves: classifiedMoves,
      candidateMoments
    };
    const plan = await generatePlan(deps, plannerInput);

    await analysesRepo.markReady(db, analysis.id, plan);
  } catch (error) {
    // markFailed only persists the message to `analyses.error` — without this,
    // the job queue still logs the job as completed (it caught its own
    // error), so a failure is otherwise invisible to log-based ops tooling.
    console.error(`runAnalyzeGameJob failed for game ${gameId} (analysis ${analysis.id}):`, error);
    await analysesRepo.markFailed(db, analysis.id, describeError(error));
  }
}

/** Task 50.3: `isBrilliantMove` sees `brilliantSoundness === undefined` (its
 * fail-closed default) unless we run this pre-pass. Cheap-gate candidates
 * (typically 0-2 per game) each cost one extra `analyzePosition` call to
 * evaluate §5.5's B6 — the opponent's best reply, at the batch's normal
 * depth, still leaves the mover close to their pre-sacrifice win%. */
async function resolveBrilliantSoundness(
  deps: AnalysisJobDependencies,
  candidateMoves: ClassifiedMoveDto[],
  bookWalk: ReturnType<typeof inBookWalk>
): Promise<ReadonlyMap<number, boolean>> {
  const soundnessByPly = new Map<number, boolean>();
  for (const move of candidateMoves) {
    const candidate = brilliantSoundnessCandidate(move, bookWalk);
    if (!candidate) continue;
    const sound = await checkBrilliantSoundness(
      { analyzePosition: deps.analyzePosition },
      candidate.fenAfter,
      candidate.mover,
      candidate.beforeWin
    );
    soundnessByPly.set(move.ply, sound);
  }
  return soundnessByPly;
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

function attachEnrichment(
  moves: ReturnType<typeof classifyMoves>,
  enrichment: ReturnType<typeof enrichPositions>
): ReturnType<typeof classifyMoves> {
  return moves.map((move) => {
    const position = enrichment[move.ply];
    if (!position?.moveFlags || !position.featureDelta) {
      throw new Error(`Missing move enrichment for ply ${move.ply}`);
    }
    return {
      ...move,
      features: position.features,
      moveFlags: position.moveFlags,
      featureDelta: position.featureDelta
    };
  });
}

/** Attaches each ply's `computeTacticMotifPrevented`-derived byPly entry
 * (if any) onto its move — a ply with nothing reachable simply has no entry
 * and keeps `tacticPrevention` undefined, same as a quiet position never
 * gaining a `tacticOpportunity`. */
function attachTacticPrevention(
  moves: ClassifiedMoveDto[],
  byPly: Map<number, { type: TacticMotifType; prevented: boolean; detail: string | null }>
): ClassifiedMoveDto[] {
  return moves.map((move) => {
    const prevention = byPly.get(move.ply);
    if (!prevention) return move;
    return {
      ...move,
      tacticPrevention: prevention,
      // Diagnostic-first (see the tactic-prevention over-firing investigation):
      // spelling out which motif + whether it was defused, right in the same
      // per-move notes the UI already shows, so a reviewer can eyeball
      // false-positive detector hits without a DB query.
      reasons: [...(move.reasons ?? []), tacticPreventionReason(prevention)]
    };
  });
}

function tacticPreventionReason(prevention: { type: TacticMotifType; prevented: boolean; detail: string | null }): string {
  const label = TACTIC_MOTIF_LABELS[prevention.type];
  const detailClause = prevention.detail ? ` — ${prevention.detail}` : '';
  return prevention.prevented
    ? `Opponent's ${label} threat: defused${detailClause}`
    : `Opponent's ${label} threat: not defused${detailClause}`;
}

function buildBookReport(positions: ParsedPosition[]): BookReport {
  const bookWalk = inBookWalk(positions);
  const opening = resolveOpening(positions.map((position) => positionKey(position.fen)));
  const lastBookPly = Math.max(bookWalk.lastBookPly.white, bookWalk.lastBookPly.black);

  return {
    source: OPENING_BOOK_SOURCE,
    eco: opening?.eco ?? null,
    ecoVolume: opening?.ecoVolume ?? null,
    name: opening?.name ?? null,
    family: opening?.family ?? null,
    variation: opening?.variation ?? null,
    namedAtPly: opening?.ply ?? null,
    lastBookPly,
    players: {
      white: buildPlayerBookReport('white', positions, bookWalk),
      black: buildPlayerBookReport('black', positions, bookWalk)
    }
  };
}

function buildPlayerBookReport(
  colour: 'white' | 'black',
  positions: ParsedPosition[],
  bookWalk: ReturnType<typeof inBookWalk>
): PlayerBookReport {
  const leftBook = bookWalk.find((result) => {
    const position = positions[result.ply];
    return result.leftBook !== undefined && position?.mover === colour;
  })?.leftBook;

  return {
    lastBookPly: bookWalk.lastBookPly[colour],
    leftBookPly: leftBook?.ply ?? null,
    leftBookMove: leftBook?.played ?? null,
    bookAlternatives: leftBook?.alternatives ?? []
  };
}

/**
 * Analyzes the game a chunk at a time, persisting what's done after each one.
 *
 * The evals are identical either way — this exists so the wait is legible.
 * `engine_running` is by far the longest step (tens of seconds; longer still
 * in browser mode, where a real game measured ~42s), and analyzing in one
 * call meant nothing observable happened until all of it finished. Writing
 * each chunk lets GET /api/analyses/:id/status report how many positions are
 * done, which is what drives the percentage on the progress screen.
 *
 * Deliberately at this layer rather than in either EngineBackend, so native
 * and browser mode report progress the same way.
 */
async function analyzeInChunks(
  db: Kysely<Database>,
  deps: AnalysisJobDependencies,
  analysisId: string,
  fens: string[]
): Promise<EngineEval[]> {
  const evals: EngineEval[] = [];

  for (let start = 0; start < fens.length; start += ENGINE_CHUNK_POSITIONS) {
    const chunk = fens.slice(start, start + ENGINE_CHUNK_POSITIONS);
    const chunkEvals = await deps.analyzeGamePositions(chunk);
    // Each EngineEval's `ply` is chunk-relative (0..chunk.length-1) — the
    // backend only ever sees this one chunk — so it has to be shifted by
    // `start` to become the position's real index in the game.
    // repairEvalSignConvention swaps a near-tied first/second line back into
    // best-first order instead of the whole job dying over engine search
    // noise (a real Stockfish multiPv quirk under time pressure, not corrupt
    // data — see its doc comment).
    const renumberedChunkEvals = chunkEvals.map((evalResult, i) => ({
      ...evalResult,
      ply: start + i,
      lines: repairEvalSignConvention(evalResult.fen, evalResult.lines)
    }));
    evals.push(...renumberedChunkEvals);
    await analysesRepo.storeEngineEvals(db, analysisId, evals);
  }

  // An empty game would otherwise never write the (empty) evals at all.
  if (fens.length === 0) await analysesRepo.storeEngineEvals(db, analysisId, evals);

  return evals;
}

async function generatePlan(deps: AnalysisJobDependencies, input: PlannerPromptInput): Promise<CoachingPlan> {
  return deps.callPlanner(buildPlannerMessages(input));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
