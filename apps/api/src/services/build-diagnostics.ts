import {
  DIAGNOSTIC_DETECTORS,
  buildPlyDiagnosticContext,
  computeTacticMotifRankHits,
  extractPgnMoveComments,
  resolveEpisodes,
  type DiagnosticDetector,
  type DiagnosticObservation,
  type EpisodePly,
  type TacticDiagnosticEntry
} from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto, EngineEval } from '@freechesscoach/shared';
import type { NewDiagnosticObservation } from '../db/repositories/diagnostic-observations.js';

export interface BuildDiagnosticsInput {
  gameId: string;
  userId: string;
  userColor: 'white' | 'black';
  pgn: string;
  moves: readonly ClassifiedMoveDto[];
  evals: readonly EngineEval[];
  /** Task 50.4's unbiased defensive-direction source, already computed by
   * `computeTacticMotifPrevented` earlier in the same analysis job —
   * `TA-*` direction-`D` detectors read this via `ctx.tacticDiagnostic`. */
  diagnosticByPly: ReadonlyMap<number, TacticDiagnosticEntry>;
}

/**
 * Orchestrates Phase 53's detector registry + Task 54.3's episode
 * resolution over one already-analyzed game, producing the rows Task 56.2's
 * `insertMany` persists. Everything below is wiring: the actual detection
 * and precedence/cascade logic already lives in
 * `packages/chess-analysis/src/diagnostics`.
 *
 * Only `userColor`'s own plies are diagnosed (§I "the student's own
 * decisions", and this task's own requirement) — the opponent's moves never
 * produce observations, though they still flow through as `previousMove`/
 * `nextMoves` context for detectors that need to see the move before/after
 * (e.g. `MS-07`'s recapture check).
 *
 * `detectors` defaults to the real registry; the parameter exists only so a
 * test can inject a detector that throws without needing a live registry
 * entry that does.
 */
export function buildDiagnosticObservations(
  input: BuildDiagnosticsInput,
  detectors: readonly DiagnosticDetector[] = DIAGNOSTIC_DETECTORS
): NewDiagnosticObservation[] {
  const movesByPly = new Map(input.moves.map((move) => [move.ply, move] as const));
  const userMoves = input.moves.filter((move) => move.mover === input.userColor);
  const moveTimes = extractPgnMoveComments(input.pgn);
  const rankHitsByPly = groupRankHitsByPly(computeTacticMotifRankHits([...userMoves], [...input.evals]));

  const plies: EpisodePly[] = [];
  const nonFailedObservations: DiagnosticObservation[] = [];

  for (const move of userMoves) {
    const ctx = buildPlyDiagnosticContext(move, {
      moveTimes,
      previousMove: movesByPly.get(move.ply - 1),
      nextMoves: [movesByPly.get(move.ply + 1), movesByPly.get(move.ply + 2)].filter(
        (candidate): candidate is ClassifiedMoveDto => candidate !== undefined
      ),
      tacticDiagnostic: input.diagnosticByPly.get(move.ply),
      tacticRankHits: rankHitsByPly.get(move.ply)
    });
    if (!ctx) continue;

    const observations = detectPly(detectors, ctx, input.gameId, move.ply);
    for (const observation of observations) {
      if (!observation.failed) nonFailedObservations.push(observation);
    }

    plies.push({
      ply: move.ply,
      winPctBefore: move.winPctBefore ?? 0,
      winPctAfter: move.winPctAfter ?? 0,
      observations
    });
  }

  const episodes = resolveEpisodes(plies);

  return [...episodes.map((episode) => episode.primary), ...nonFailedObservations].map((observation) => toRow(input, observation));
}

function detectPly(
  detectors: readonly DiagnosticDetector[],
  ctx: Parameters<DiagnosticDetector['detect']>[0],
  gameId: string,
  ply: number
): DiagnosticObservation[] {
  const observations: DiagnosticObservation[] = [];
  for (const detector of detectors) {
    try {
      const observation = detector.detect(ctx);
      if (observation) observations.push(observation);
    } catch (error) {
      // One detector's bug must never blank out every other detector's
      // finding for this ply, let alone the rest of the game — same
      // isolation principle as the job-level try/catch this function is
      // called under (see services/analysis.ts).
      console.error(`diagnostic detector ${detector.code}.${detector.direction} threw on game ${gameId} ply ${ply}:`, error);
    }
  }
  return observations;
}

function groupRankHitsByPly<T extends { ply: number }>(hits: readonly T[]): Map<number, T[]> {
  const byPly = new Map<number, T[]>();
  for (const hit of hits) {
    const existing = byPly.get(hit.ply);
    if (existing) existing.push(hit);
    else byPly.set(hit.ply, [hit]);
  }
  return byPly;
}

/**
 * `observation.detail` (the detector's human-readable text) and
 * `DiagnosticEntry`'s richer per-opportunity context (opening, phase,
 * clock, complexity, opponent rating — Task 55.3's aggregation input)
 * aren't persisted onto this row (0032_annotated_pgn.ts): the row is a thin
 * `(gameId, ply)` pointer into the game's own `annotatedPgn`, which is
 * where that detail is derived from on read (the evidence drill-down),
 * rather than snapshotted redundantly onto every observation.
 */
function toRow(input: BuildDiagnosticsInput, observation: DiagnosticObservation): NewDiagnosticObservation {
  return {
    userId: input.userId,
    gameId: input.gameId,
    ply: observation.ply,
    code: observation.code,
    direction: observation.direction,
    failed: observation.failed,
    hwdl: observation.hwdl,
    severity: observation.severity,
    reachability: observation.reachability
  };
}
