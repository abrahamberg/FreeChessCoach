import { ENGINE_MULTI_PV, type EngineLine, type TacticMotifType } from '@freechesscoach/shared';
import { annotatePvTactics } from './pv-tactics.js';
import { scanDepthForRank } from './prevention-scan-schedule.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

export interface PvMotifSighting {
  rank: number;
  ply: number;
  moveSan: string;
  motif: TacticMotifType;
  /** The position `moveSan` was played from — lets a caller replay this
   * exact sighting. */
  fenBefore: string;
  /** The claim itself: which piece does it, what it hits, what it expects to
   * win, and the arrows to draw. Carrying it means the prevention path can
   * compare *threats* rather than type names, and the card can be written
   * from the same object the scan found rather than from a second replay. */
  claim: VerifiedTacticClaim;
}

export interface AvailableMotifScan {
  motifs: ReadonlySet<TacticMotifType>;
  sightings: PvMotifSighting[];
}

/**
 * A threat's identity, stable across the two positions the prevention path
 * compares: the motif plus the piece it expects to win, or the squares it
 * bears on when it expects to win nothing in particular.
 *
 * This is what "the same threat" means once claims replaced type names. The
 * old comparison diffed motif *types*, which had two failure modes the doc
 * (`docs/tactics-rework.md` §4 cause 6) records: a phantom fork in the
 * "before" set that happened not to recur became "you defused their fork",
 * and an unrelated new fork elsewhere on the board made a genuinely defused
 * one read as still live. Keying on the threatened square fixes both.
 */
export function threatKey(claim: Pick<VerifiedTacticClaim, 'type' | 'victim' | 'targets'>): string {
  return `${claim.type}:${claim.victim ?? [...claim.targets].sort().join('+')}`;
}

/**
 * The multi-ply generalization of `scanTacticsForLines`: walks each of
 * `lines`' PVs to a rank-dependent depth (the graduated schedule,
 * `scanDepthForRank`) via the existing `annotatePvTactics` — no changes to
 * `pv-tactics.ts` itself. Only odd plies (1, 3, 5, ...) are collected: those
 * are the side-to-move's own moves; even plies are the engine's intervening
 * hypothetical reply, walked through only to reach the next real position,
 * never credited as a sighting.
 *
 * Every verified claim on a step is a sighting, not just its headline —
 * a threat the mover has to answer is a threat whether or not it happened to
 * lead the card.
 *
 * Graceful degradation is automatic: a missing/single-element `pvSan`
 * produces exactly one step and stops, identical to the ply-1-only behavior
 * this generalizes.
 */
export function scanAvailableMotifs(
  fenBefore: string,
  lines: readonly EngineLine[],
  topN: number = ENGINE_MULTI_PV
): AvailableMotifScan {
  const sightings: PvMotifSighting[] = [];
  lines.slice(0, topN).forEach((line, rank) => {
    const pv = line.pvSan && line.pvSan.length > 0 ? line.pvSan : [line.moveSan];
    const { steps } = annotatePvTactics(fenBefore, pv, scanDepthForRank(rank));
    for (const step of steps) {
      if (step.ply % 2 === 0) continue;
      for (const claim of step.claims) {
        sightings.push({ rank, ply: step.ply, moveSan: step.moveSan, motif: claim.type, fenBefore: step.fenBefore, claim });
      }
    }
  });
  return { motifs: new Set(sightings.map((sighting) => sighting.motif)), sightings };
}
