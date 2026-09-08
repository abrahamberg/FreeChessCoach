import {
  TACTIC_MOTIF_TYPES,
  type ClassifiedMoveDto,
  type EngineEval,
  type MoveQuality,
  type TacticMotifCounts,
  type TacticMotifType
} from '@freechesscoach/shared';
import { classifyTacticMotif } from './classify-tactic-motif.js';
import { CONFIG } from './config.js';
import { describeTacticHit } from './describe-tactic-hit.js';
import { moveFlags } from './move-flags.js';
import { tacticHitVisual, type TacticVisual } from './tactic-hit-visual.js';

/** Also reused by apps/api's tactic-prevention.ts: a still-reachable threat
 * after a best-or-better reply isn't something the player should have
 * prevented — there was no better move, so it's never counted as
 * preventable there either. */
export const BEST_OR_BETTER: ReadonlySet<MoveQuality> = new Set(['brilliant', 'great', 'best']);

function emptyCounts(): TacticMotifCounts {
  const entries = TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }] as const);
  return Object.fromEntries(entries) as TacticMotifCounts;
}

export interface TacticMotifOpportunity {
  type: TacticMotifType;
  found: boolean;
  /** The concrete piece/square this hit involves (describeTacticHit) —
   * `null` for a type with no detector-specific shape to describe
   * (checkmate/brilliantSacrifice/other), not "not computed". */
  detail: string | null;
  /** The same hit's board geometry (tacticHitVisual) — an arrow/highlight
   * the Game Review UI can draw for this opportunity, `null` under the same
   * conditions `detail` is. */
  visual: TacticVisual | null;
}

/**
 * The engine's best move at this single ply, classified — the "opportunity"
 * both `computeTacticMotifCounts` (aggregated below) and
 * `build-game-report.ts` (attached to the move itself, for the move-list
 * UI's per-ply tactic indicator) are built from. `null` when this ply isn't
 * a named-motif opportunity at all (no matching detector, or missing
 * fenBefore/eval data).
 *
 * The opportunity's own quality is only known precisely when the player
 * actually played it (reusing that move's already-computed classification,
 * which can be `'brilliant'`); otherwise it's treated as a plain `'best'`
 * for motif-classification purposes, since determining whether an *unplayed*
 * candidate is genuinely brilliant needs the narrow extra engine call
 * (Phase 14.3) this pipeline deliberately reserves for played-move
 * candidates only — a real but accepted undercount of missed brilliancies.
 */
export function classifyTacticMotifOpportunity(move: ClassifiedMoveDto, evals: EngineEval[]): TacticMotifOpportunity | null {
  const bestMoveSan = evals[move.ply - 1]?.lines[0]?.moveSan;
  if (!move.fenBefore || !bestMoveSan) return null;

  const playedBest = bestMoveSan === move.moveSan;
  const bestQuality: MoveQuality = playedBest ? move.quality : 'best';
  const bestIsCheckmate = playedBest ? (move.moveFlags?.isCheckmate ?? false) : checkmateFlag(move.fenBefore, bestMoveSan);
  if (bestIsCheckmate === null) return null;

  const motif = classifyTacticMotif({
    fenBefore: move.fenBefore,
    moveSan: bestMoveSan,
    mover: move.mover,
    quality: bestQuality,
    isCheckmate: bestIsCheckmate,
    isTacticalPosition: move.isTacticalPosition === true
  });
  if (!motif) return null;

  return {
    type: motif,
    found: playedBest && BEST_OR_BETTER.has(move.quality),
    detail: describeTacticHit(motif, move.fenBefore, bestMoveSan, move.mover),
    visual: tacticHitVisual(motif, move.fenBefore, bestMoveSan, move.mover)
  };
}

/**
 * For each of the colour's moves, tags the motif of the engine's best move
 * at that position (the "opportunity") and credits "found" only when the
 * player played that exact move with a best-or-better classification — see
 * `classifyTacticMotifOpportunity` above for the per-move logic this sums.
 */
export function computeTacticMotifCounts(colourMoves: ClassifiedMoveDto[], evals: EngineEval[]): TacticMotifCounts {
  const counts = emptyCounts();

  for (const move of colourMoves) {
    const opportunity = classifyTacticMotifOpportunity(move, evals);
    if (!opportunity) continue;

    counts[opportunity.type].opportunities += 1;
    if (opportunity.found) counts[opportunity.type].found += 1;
  }
  return counts;
}

function checkmateFlag(fenBefore: string, moveSan: string): boolean | null {
  try {
    return moveFlags(fenBefore, moveSan).isCheckmate;
  } catch {
    return null;
  }
}

export interface TacticMotifRankHit {
  ply: number;
  motif: TacticMotifType;
  /** 0-indexed position within that ply's `evals[...].lines`. */
  rank: number;
  /** This same line's rank when it's also the move the player actually
   * played at this ply; `null` otherwise. */
  playedRank: number | null;
}

/**
 * The richer, per-rank generalization of `computeTacticMotifCounts` above:
 * classifies every one of the top-`topN` engine lines at each ply (not just
 * `lines[0]`), reusing the exact same played-move quality/checkmate lookup
 * so that aggregating this function's `rank === 0` hits into
 * opportunities/found counts reproduces `computeTacticMotifCounts`'s output
 * exactly (see this file's test suite's superset-regression case).
 *
 * Deliberately NOT called from `build-game-report.ts` in this phase —
 * `PlayerReportSchema`/`TacticMotifCountsSchema` stay unchanged, so this is
 * additive and unwired pending a product decision on whether "found it on
 * your 2nd-best-move rank" is worth a new UI surface.
 */
export function computeTacticMotifRankHits(
  colourMoves: ClassifiedMoveDto[],
  evals: EngineEval[],
  topN: number = CONFIG.tacticScan.defaultTopN
): TacticMotifRankHit[] {
  const hits: TacticMotifRankHit[] = [];

  for (const move of colourMoves) {
    const evalAtPly = evals[move.ply - 1];
    if (!move.fenBefore || !evalAtPly) continue;
    const fenBefore = move.fenBefore;

    evalAtPly.lines.slice(0, topN).forEach((line, rank) => {
      const playedThisLine = line.moveSan === move.moveSan;
      const quality: MoveQuality = playedThisLine ? move.quality : 'best';
      const isCheckmate = playedThisLine ? (move.moveFlags?.isCheckmate ?? false) : checkmateFlag(fenBefore, line.moveSan);
      if (isCheckmate === null) return;

      const motif = classifyTacticMotif({
        fenBefore,
        moveSan: line.moveSan,
        mover: move.mover,
        quality,
        isCheckmate,
        isTacticalPosition: move.isTacticalPosition === true
      });
      if (!motif) return;

      hits.push({ ply: move.ply, motif, rank, playedRank: playedThisLine ? rank : null });
    });
  }
  return hits;
}
