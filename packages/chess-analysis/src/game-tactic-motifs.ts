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
import { classifyPlayedTacticAlternative } from './played-tactic-alternative.js';
import type { MoveVerdict } from './move-verdict/types.js';
import { checkmateFlag, isFalseMiss, isTacticImmaterial } from './tactic-opportunity-witness.js';
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
 * a missed/found verdict's card is built from (`move-verdict/`, via
 * `classifyTacticChance` below). `null` when this ply isn't
 * a named-motif opportunity at all (no matching detector, or missing
 * fenBefore/eval data).
 *
 * Whether the *player* met that opportunity is not the same question as
 * whether they played this exact move: an equally good move of their own
 * that wins as much is not a miss, and the card then names their move's
 * tactic instead (`played-tactic-alternative.ts`). Which ply counts as an
 * opportunity is decided by the engine's move alone either way.
 *
 * The eval witnesses both verdicts (`tactic-opportunity-witness.ts`): the
 * ply is no opportunity when the best other-motif line evaluates as well
 * (the tactic decided nothing), and no verdict at all when the motif went
 * unfound but the played move lost nothing meaningful. Moves stored without
 * `cpBefore`/`cpAfter` keep the eval-blind verdict.
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
  return withMissWitness(move, classifyTacticChance(move, evals, previous));
}

/**
 * The no-false-miss half of the eval witness, on its own: a chance the
 * player didn't take, on a move that kept the value, is no verdict at all.
 */
export function withMissWitness(
  move: ClassifiedMoveDto,
  chance: TacticMotifOpportunity | null
): TacticMotifOpportunity | null {
  return chance && isFalseMiss(move, chance.found) ? null : chance;
}

/**
 * `classifyTacticMotifOpportunity` before the no-false-miss gate: whether the
 * tactic was there and decided something, regardless of what the reply cost.
 * What the *previous* move allowed is read off this (`build-game-report.ts`),
 * since a reply that kept most of the prize doesn't make the prize any less
 * handed over.
 */
export function classifyTacticChance(
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
  // The eval witness (tactic-opportunity-witness.ts): a motif whose next-best
  // other line evaluates as well decided nothing, so the ply is no chance.
  if (isTacticImmaterial(move, evals[move.ply - 1]?.lines ?? [], best.headline)) return null;

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
 * One colour's per-motif tally, read off its moves' verdicts
 * (`move-verdict/`, `docs/plan.md` Task 77.5):
 * - opportunities = the `missedTactic` + `foundTactic` verdicts, by the
 *   card's motif, plus every `missedMate` + `foundMate` verdict under
 *   `checkmate` (whatever mating motif the card names);
 * - found = the `foundTactic` verdicts by motif, plus `foundMate` under
 *   `checkmate`.
 *
 * **Changed in Task 77.5.** This used to classify the engine's best move at
 * every ply on its own (`classifyTacticMotifOpportunity`), so a ply counted
 * as an opportunity whether or not the tactic was the reason the move
 * mattered, and one move could feed this tally *and* the prevention tally.
 * Now a ply counts only when its one verdict is a missed or found tactic or
 * mate; a move whose stronger reason was a tactic it allowed or a threat it
 * defused is counted in the prevention tally instead, and a `null` verdict
 * counts nowhere.
 */
export function computeTacticMotifCounts(verdicts: Iterable<MoveVerdict | null>): TacticMotifCounts {
  const counts = emptyCounts();

  for (const verdict of verdicts) {
    const counted = countedMotif(verdict);
    if (!counted) continue;
    counts[counted.type].opportunities += 1;
    if (counted.found) counts[counted.type].found += 1;
  }
  return counts;
}

function countedMotif(verdict: MoveVerdict | null): { type: TacticMotifType; found: boolean } | null {
  if (verdict?.reason === 'missedMate' || verdict?.reason === 'foundMate') {
    return { type: 'checkmate', found: verdict.reason === 'foundMate' };
  }
  if (verdict?.reason !== 'missedTactic' && verdict?.reason !== 'foundTactic') return null;
  const opportunity = verdict.card.tacticOpportunity;
  return opportunity ? { type: opportunity.type, found: verdict.reason === 'foundTactic' } : null;
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
 * Classifies every one of the top-`topN` engine lines at each ply (not just
 * `lines[0]`), with the same played-move quality/checkmate lookup as
 * `classifyTacticChance` — the direction-`O` `TA-*` diagnostics' §4.5
 * "found it at rank N" signal.
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
