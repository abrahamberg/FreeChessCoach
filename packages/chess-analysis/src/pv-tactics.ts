import { applySanSequence } from './apply-san-sequence.js';
import { diffPositionFeatures } from './diff-features.js';
import { computePositionFeatures } from './position-features.js';

export interface PvTacticStep {
  ply: number;
  moveSan: string;
  createsFork: boolean;
  createsHangingPiece: boolean;
  mobilityDelta: number;
}

export interface PvTacticAnnotation {
  moveSan: string;
  steps: PvTacticStep[];
  /** First ply (1-indexed within this PV) at which a fork was newly created
   * by THIS candidate's own side — i.e. an odd ply, since pvSan[0] is always
   * the mover's own move (ply 1, 3, 5, ... are the mover's; ply 2, 4, 6, ...
   * are the opponent's replies). Null if no such fork appears within the
   * walked plies. This is the concrete meaning of "I get a fork in N moves." */
  forkInPlies: number | null;
}

/**
 * The multi-ply generalization of candidate-moves.ts's annotateCandidateMoves
 * (which only looks one ply ahead) — walks a candidate line's full principal
 * variation, reusing the same three building blocks (applySanSequence,
 * computePositionFeatures, diffPositionFeatures) at each resulting position
 * instead of just the first. Capped at maxPlies; stops early (without
 * throwing) if the PV runs out or contains an illegal move, mirroring
 * applySanSequence's own graceful degradation.
 */
export function annotatePvTactics(fenBefore: string, pvSan: string[], maxPlies = 6): PvTacticAnnotation {
  const walked = pvSan.slice(0, maxPlies);
  const moveSan = walked[0] ?? '';
  const applied = applySanSequence(fenBefore, walked);

  const steps: PvTacticStep[] = [];
  let previousFeatures = computePositionFeatures(fenBefore);

  applied.moves.forEach((move, index) => {
    const features = computePositionFeatures(move.fen);
    const delta = diffPositionFeatures(previousFeatures, features);
    steps.push({
      ply: index + 1,
      moveSan: move.san,
      createsFork: delta.newForks.length > 0,
      createsHangingPiece: delta.newHangingPieces.length > 0,
      mobilityDelta: delta.mobilityDelta
    });
    previousFeatures = features;
  });

  const forkStep = steps.find((step) => step.ply % 2 === 1 && step.createsFork);

  return { moveSan, steps, forkInPlies: forkStep?.ply ?? null };
}
