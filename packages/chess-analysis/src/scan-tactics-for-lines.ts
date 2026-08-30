import type { EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { classifyCandidateMove } from './classify-candidate-move.js';
import { CONFIG } from './config.js';

export interface TacticSighting {
  moveSan: string;
  motif: TacticMotifType;
  /** 0-indexed position within the `lines` array this sighting came from —
   * "how good does the engine think this move is," not a ranking of the
   * sighting itself. */
  rank: number;
}

/**
 * Classifies each of a side's already-fetched engine lines (top-`topN` only)
 * via `classifyCandidateMove` — the same registry (Phase 32) every other
 * caller uses — and keeps the ones that carry a tactic motif, tagged with
 * which engine-line rank they sit at. Pure: spends no engine call itself,
 * since `lines` is whatever the caller already fetched.
 */
export function scanTacticsForLines(
  fenBefore: string,
  lines: readonly EngineLine[],
  mover: 'white' | 'black',
  topN: number = CONFIG.tacticScan.defaultTopN
): TacticSighting[] {
  const sightings: TacticSighting[] = [];
  lines.slice(0, topN).forEach((line, rank) => {
    const motif = classifyCandidateMove(fenBefore, line.moveSan, mover, { linesAtFenBefore: lines as EngineLine[] });
    if (motif) sightings.push({ moveSan: line.moveSan, motif, rank });
  });
  return sightings;
}
