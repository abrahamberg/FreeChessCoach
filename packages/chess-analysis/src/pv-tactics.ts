import { Chess, type Square } from 'chess.js';
import type { TacticMotifType } from '@freechesscoach/shared';
import { applySanSequence } from './apply-san-sequence.js';
import { fenActiveColor } from './attack-map.js';
import { classifyCandidateClaims } from './classify-candidate-move.js';
import { diffPositionFeatures } from './diff-features.js';
import { computePositionFeatures } from './position-features.js';
import type { PreviousMove } from './tactic-detectors/context.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

export interface PvTacticStep {
  ply: number;
  moveSan: string;
  createsFork: boolean;
  createsHangingPiece: boolean;
  mobilityDelta: number;
  /** This step's headline motif, classified from the position right before
   * it was played — same registry as everywhere else. */
  motif: TacticMotifType | null;
  /** Every motif this step survives verification with, best first. The
   * prevention path compares these rather than `motif`: a threat is defused
   * when the piece it was going to win is no longer winnable, not when a
   * type name leaves a set (docs/tactics-rework.md §5 layer 3). */
  claims: VerifiedTacticClaim[];
  /** The position `moveSan` was played from — lets a caller replay this one
   * step in isolation (e.g. to describe exactly which piece a `motif` hit
   * involves) without re-walking the whole PV from `annotatePvTactics`'
   * own `fenBefore` argument. */
  fenBefore: string;
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
  const initialMover = fenActiveColor(fenBefore);
  let previousFen = fenBefore;
  let previousFeatures = computePositionFeatures(fenBefore);

  let previousMove: PreviousMove | null = null;

  applied.moves.forEach((move, index) => {
    const features = computePositionFeatures(move.fen);
    const delta = diffPositionFeatures(previousFeatures, features);
    const stepMover = index % 2 === 0 ? initialMover : initialMover === 'white' ? 'black' : 'white';
    // Inside a PV the previous move is known exactly, which is what lets the
    // recapture gate work on an engine line the same way it works on a game.
    const classification = classifyCandidateClaims(previousFen, move.san, stepMover, { previous: previousMove });
    steps.push({
      ply: index + 1,
      moveSan: move.san,
      createsFork: delta.newForks.length > 0,
      createsHangingPiece: delta.newHangingPieces.length > 0,
      mobilityDelta: delta.mobilityDelta,
      motif: classification?.headline ?? null,
      claims: classification?.claims ?? [],
      fenBefore: previousFen
    });
    previousMove = appliedMoveAsPrevious(previousFen, move.uci);
    previousFen = move.fen;
    previousFeatures = features;
  });

  const forkStep = steps.find((step) => step.ply % 2 === 1 && step.createsFork);

  return { moveSan, steps, forkInPlies: forkStep?.ply ?? null };
}

/**
 * An applied PV move in the shape the detectors want as history.
 *
 * `applySanSequence` reports each move as SAN plus UCI plus the resulting
 * FEN, not as a chess.js move object, so "was it a capture?" is answered by
 * looking at what stood on the destination square beforehand. En passant is
 * the one capture this misses; the recapture gate treats an unknown history
 * as "not a recapture", so missing it costs a gate, never a false one.
 */
function appliedMoveAsPrevious(fenBefore: string, uci: string): PreviousMove | null {
  if (uci.length < 4) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;

  try {
    return { from, to, wasCapture: new Chess(fenBefore).get(to) !== undefined };
  } catch {
    return null;
  }
}
