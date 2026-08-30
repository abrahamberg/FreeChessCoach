import { ENGINE_MULTI_PV, type EngineLine, type TacticMotifType } from '@freechesscoach/shared';
import { annotatePvTactics } from './pv-tactics.js';
import { scanDepthForRank } from './prevention-scan-schedule.js';

export interface PvMotifSighting {
  rank: number;
  ply: number;
  moveSan: string;
  motif: TacticMotifType;
}

export interface AvailableMotifScan {
  motifs: ReadonlySet<TacticMotifType>;
  sightings: PvMotifSighting[];
}

/**
 * The multi-ply generalization of `scanTacticsForLines` (Phase 45 of
 * docs/plan.md): walks each of `lines`' PVs to a rank-dependent depth (the
 * graduated schedule, `scanDepthForRank`) via the existing `annotatePvTactics`
 * — no changes to `pv-tactics.ts` itself. Only odd plies (1, 3, 5, ...) are
 * collected: those are the side-to-move's own moves; even plies are the
 * engine's intervening hypothetical reply, walked through only to reach the
 * next real position, never credited as a sighting.
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
      if (step.ply % 2 === 1 && step.motif) sightings.push({ rank, ply: step.ply, moveSan: step.moveSan, motif: step.motif });
    }
  });
  return { motifs: new Set(sightings.map((s) => s.motif)), sightings };
}
