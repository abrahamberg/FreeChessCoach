import {
  TACTIC_MOTIF_TYPES,
  type ClassifiedMoveDto,
  type EngineEval,
  type MoveQuality,
  type TacticGainDto,
  type TacticHorizon,
  type TacticMotifCounts,
  type TacticMotifType,
  type TacticVisualDto
} from '@freechesscoach/shared';
import { classifyTacticClaims, classifyTacticMotif } from './classify-tactic-motif.js';
import { CONFIG } from './config.js';
import { moveFlags } from './move-flags.js';
import { classifyPlayedTacticAlternative } from './played-tactic-alternative.js';
import { previousMoveOf } from './previous-move-of.js';
import type { PreviousMove } from './tactic-detectors/context.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

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
  /** The concrete piece/square this hit involves — `null` for a type with no
   * detector-specific shape to describe (checkmate/brilliantSacrifice/other),
   * not "not computed". Comes off the headline claim itself now, rather than
   * from a second replay in `tactic-hit-detail.ts`. */
  detail: string | null;
  /** The same claim's board geometry — an arrow/highlight the Game Review UI
   * can draw, `null` under the same conditions `detail` is. */
  visual: TacticVisualDto | null;
  /** What the verifier could show the claim actually wins. Absent for a
   * quality-derived headline with no claim behind it. */
  gain?: TacticGainDto;
  horizon?: TacticHorizon;
  confidence?: number;
  /** Every verified motif this move embodies, best first — the multi-label
   * view (§5 layer 3). `type` is its first entry whenever a claim produced
   * the headline. */
  motifs?: TacticMotifType[];
  /** The move this motif was read off — the engine's top move, or the
   * player's own when it reached as much (`played-tactic-alternative.ts`).
   * Whatever replays the motif has to replay this one. */
  embodiedBySan?: string;
}

/**
 * The engine's best move at this single ply, classified — the "opportunity"
 * both `computeTacticMotifCounts` (aggregated below) and
 * `build-game-report.ts` (attached to the move itself, for the move-list
 * UI's per-ply tactic indicator) are built from. `null` when this ply isn't
 * a named-motif opportunity at all (no matching detector, or missing
 * fenBefore/eval data).
 *
 * Whether the *player* met that opportunity is not the same question as
 * whether they played this exact move: an equally good move of their own
 * that wins as much is not a miss, and the card then names their move's
 * tactic instead (`played-tactic-alternative.ts`). Which ply counts as an
 * opportunity is decided by the engine's move alone either way.
 *
 * The opportunity's own quality is only known precisely when the player
 * actually played it (reusing that move's already-computed classification,
 * which can be `'brilliant'`); otherwise it's treated as a plain `'best'`
 * for motif-classification purposes, since determining whether an *unplayed*
 * candidate is genuinely brilliant needs the narrow extra engine call
 * (Phase 14.3) this pipeline deliberately reserves for played-move
 * candidates only — a real but accepted undercount of missed brilliancies.
 */
export function classifyTacticMotifOpportunity(
  move: ClassifiedMoveDto,
  evals: EngineEval[],
  previous: PreviousMove | null = null
): TacticMotifOpportunity | null {
  const bestLine = evals[move.ply - 1]?.lines[0];
  const bestMoveSan = bestLine?.moveSan;
  if (!move.fenBefore || !bestMoveSan) return null;

  const playedBest = bestMoveSan === move.moveSan;
  const bestQuality: MoveQuality = playedBest ? move.quality : 'best';
  const bestIsCheckmate = playedBest ? (move.moveFlags?.isCheckmate ?? false) : checkmateFlag(move.fenBefore, bestMoveSan);
  if (bestIsCheckmate === null) return null;

  const best = classifyTacticClaims({
    fenBefore: move.fenBefore,
    moveSan: bestMoveSan,
    mover: move.mover,
    quality: bestQuality,
    isCheckmate: bestIsCheckmate,
    isTacticalPosition: move.isTacticalPosition === true,
    // The recapture gate only makes sense against the move actually played
    // before this position, which is the same for the engine's best move as
    // for the player's.
    previous,
    // The engine's own continuation from this move, when the batch stored
    // one: a claim that promises material has to be paid inside it. This is
    // the line half of §5 layer 2, and the reason game review widens its
    // lines from the browser at all (resolveReviewEngineBackend).
    pvSan: bestLine?.pvSan
  });
  if (!best.headline) return null;

  // The player may have reached the same payoff by another equally good
  // move; that is not a miss, and the card should name what they actually
  // played (played-tactic-alternative.ts). Gated on `best.headline` above,
  // so this can only change *what* an opportunity says, never whether the
  // ply counts as one.
  const played = playedBest ? null : classifyPlayedTacticAlternative({ move, evals, best, previous });
  const classification = played ?? best;
  const motif = classification.headline;
  if (!motif) return null;

  // The headline claim, when a claim produced it. A quality-derived headline
  // (checkmate, brilliantSacrifice) keeps the claims alongside it — TR-08 is
  // the case where answering "brilliant sacrifice" used to throw away the
  // discovered attack that made it brilliant — so the card can still name
  // the mechanism.
  const headline = classification.claims.find((claim) => claim.type === motif) ?? classification.claims[0] ?? null;

  return {
    type: motif,
    found: played !== null || (playedBest && BEST_OR_BETTER.has(move.quality)),
    detail: headline?.detail ?? null,
    visual: headline?.evidence ?? null,
    ...(headline ? { gain: gainOf(headline), confidence: headline.confidence } : {}),
    ...(headline?.horizon ? { horizon: headline.horizon } : {}),
    ...(classification.claims.length > 0 ? { motifs: classification.claims.map((claim) => claim.type) } : {}),
    embodiedBySan: played ? move.moveSan : bestMoveSan
  };
}

function gainOf(claim: VerifiedTacticClaim): TacticGainDto {
  return { kind: claim.gainKind, pawns: claim.verifiedGain, prize: claim.prize };
}

/**
 * For each of the colour's moves, tags the motif of the engine's best move
 * at that position (the "opportunity") and credits "found" when the player
 * played that exact move with a best-or-better classification, or reached as
 * much through an equally good move of their own — see
 * `classifyTacticMotifOpportunity` above for the per-move logic this sums.
 *
 * `allMoves` is both colours' moves, which is what the recapture gate needs:
 * the move before one of White's is one of Black's. It defaults to
 * `colourMoves` so a caller that only has one colour still works, at the cost
 * of the gate seeing no history.
 */
export function computeTacticMotifCounts(
  colourMoves: ClassifiedMoveDto[],
  evals: EngineEval[],
  allMoves: readonly ClassifiedMoveDto[] = colourMoves
): TacticMotifCounts {
  const counts = emptyCounts();

  for (const move of colourMoves) {
    const opportunity = classifyTacticMotifOpportunity(move, evals, previousMoveOf(allMoves, move.ply));
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
