import {
  DIAGNOSTIC_DETECTORS,
  buildEvalObservation,
  buildPlyDiagnosticContext,
  computeTacticMotifRankHits,
  extractPgnMoveComments,
  isDiagnosticallyMeaningfulPly,
  resolveEpisodes,
  verdictDiagnosticCode,
  type DiagnosticDetector,
  type DiagnosticObservation,
  type EpisodePly,
  type MoveVerdict,
  type PgnMoveComment,
  type PlyDiagnosticContext,
  type TacticDiagnosticEntry,
  type VerdictDiagnosticCode
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
  /** Each move's one tactical verdict by ply (`buildGameReportWithVerdicts`)
   * — the only source of this game's observations (Task 77.5). */
  verdicts: ReadonlyMap<number, MoveVerdict | null>;
  /** Called once per detector actually run — the benchmark's counter. */
  onDetectorRun?: (code: string) => void;
}

/**
 * Orchestrates Phase 53's detector registry + Task 54.3's episode
 * resolution over one already-analyzed game, producing the rows Task 56.2's
 * `insertMany` persists. Only `userColor`'s own plies are diagnosed; the
 * opponent's moves still flow through as `previousMove`/`nextMoves` context.
 *
 * **At most one observation per ply, from the verdict** (`docs/plan.md`
 * Task 77.5):
 * - a ply whose verdict is `null` lost nothing and had nothing at stake, so
 *   it is no §4.4 opportunity: no detector runs there;
 * - otherwise the verdict names one code (`verdictDiagnosticCode`), only
 *   that code's detector runs, and its observation is kept with
 *   `failed = verdict.kind === 'failure'`. When the detector finds nothing
 *   the observation is synthesised with `buildEvalObservation`.
 *
 * This ends the double counting where one attacked piece fed MS-02, BV-01,
 * BV-15 and MS-08 at once. The `TA-*` direction-`D` detectors read
 * `ctx.tacticDiagnostic`, which now comes from the verdict's allowed or
 * defused card (it used to come from the prevention pass's
 * `diagnosticByPly`, which is gone).
 *
 * `detectors` defaults to the real registry; the parameter exists only so a
 * test can inject a detector that throws.
 */
export function buildDiagnosticObservations(
  input: BuildDiagnosticsInput,
  detectors: readonly DiagnosticDetector[] = DIAGNOSTIC_DETECTORS
): NewDiagnosticObservation[] {
  const movesByPly = new Map(input.moves.map((move) => [move.ply, move] as const));
  // DQ-09 at detection: a ply decided either way before and after the move
  // contributes neither failures nor successes (see eval-verdict.ts).
  const userMoves = input.moves.filter((move) => move.mover === input.userColor && isDiagnosticallyMeaningfulPly(move));
  const moveTimes = extractPgnMoveComments(input.pgn);
  const plies: EpisodePly[] = [];
  const successes: DiagnosticObservation[] = [];

  for (const move of userMoves) {
    const verdict = input.verdicts.get(move.ply) ?? null;
    const observation = verdict ? observeVerdict(input, detectors, verdict, move, contextFor(move, movesByPly, moveTimes, verdict)) : null;
    if (observation && !observation.failed) successes.push(observation);
    // A ply with no observation still belongs to an open DQ-11 cascade.
    plies.push({
      ply: move.ply,
      winPctBefore: move.winPctBefore ?? 0,
      winPctAfter: move.winPctAfter ?? 0,
      observations: observation ? [observation] : []
    });
  }

  const episodes = resolveEpisodes(plies);
  return [...episodes.map((episode) => episode.primary), ...successes].map((observation) => toRow(input, observation));
}

function contextFor(
  move: ClassifiedMoveDto,
  movesByPly: ReadonlyMap<number, ClassifiedMoveDto>,
  moveTimes: readonly PgnMoveComment[],
  verdict: MoveVerdict
): PlyDiagnosticContext | null {
  return buildPlyDiagnosticContext(move, {
    moveTimes,
    previousMove: movesByPly.get(move.ply - 1),
    nextMoves: [movesByPly.get(move.ply + 1), movesByPly.get(move.ply + 2)].filter(
      (candidate): candidate is ClassifiedMoveDto => candidate !== undefined
    ),
    tacticDiagnostic: tacticDiagnosticOf(verdict)
  });
}

/** The verdict's one observation: its code's detector when that finds the
 * same thing, synthesised otherwise; `failed` is the verdict's either way. */
function observeVerdict(
  input: BuildDiagnosticsInput,
  detectors: readonly DiagnosticDetector[],
  verdict: MoveVerdict,
  move: ClassifiedMoveDto,
  ctx: PlyDiagnosticContext | null
): DiagnosticObservation | null {
  if (!ctx) return null;
  const target = verdictDiagnosticCode(verdict, move, ctx.featuresBefore);
  if (!target) return null;

  const failed = verdict.kind === 'failure';
  const matching = detectors.filter((detector) => detector.code === target.code && detector.direction === target.direction);
  const rankHits = isOwnTactic(target) ? computeTacticMotifRankHits([move], [...input.evals]) : undefined;
  const detected = detectFirst(input, matching, rankHits ? { ...ctx, tacticRankHits: rankHits } : ctx);
  if (detected) return { ...detected, failed };
  return buildEvalObservation(ctx, target.code, target.direction, failed, `${verdict.reason}: ${verdictDetailOf(verdict)}`);
}

/** The direction-`O` `TA-*` detectors read §4.5's "found it at rank N". */
function isOwnTactic(target: VerdictDiagnosticCode): boolean {
  return target.code.startsWith('TA-') && target.direction === 'O';
}

function detectFirst(input: BuildDiagnosticsInput, detectors: readonly DiagnosticDetector[], ctx: PlyDiagnosticContext): DiagnosticObservation | null {
  for (const detector of detectors) {
    try {
      input.onDetectorRun?.(detector.code);
      const observation = detector.detect(ctx);
      if (observation) return observation;
    } catch (error) {
      // One detector's bug must never blank out the rest of the game — same
      // isolation principle as the job-level try/catch this runs under.
      console.error(`diagnostic detector ${detector.code}.${detector.direction} threw on game ${input.gameId} ply ${ctx.ply}:`, error);
    }
  }
  return null;
}

/** The `TA-*` direction-`D` detectors' input, from the verdict's allowed
 * (failed) or defused (handled) card. */
function tacticDiagnosticOf(verdict: MoveVerdict): TacticDiagnosticEntry | undefined {
  const card = verdict.card.tacticAllowed ?? verdict.card.tacticPrevention;
  if (!card || verdict.card.tacticOpportunity) return undefined;
  return { type: card.type, failed: verdict.kind === 'failure', detail: card.detail ?? null };
}

function verdictDetailOf(verdict: MoveVerdict): string {
  const { tacticOpportunity, tacticAllowed, tacticPrevention } = verdict.card;
  const card = tacticOpportunity ?? tacticAllowed ?? tacticPrevention;
  return card?.detail ?? card?.type ?? 'tactic';
}

/**
 * `observation.detail` and `DiagnosticEntry`'s richer per-opportunity
 * context aren't persisted onto this row (0032_annotated_pgn.ts): the row is
 * a thin `(gameId, ply)` pointer into the game's own `annotatedPgn`.
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
