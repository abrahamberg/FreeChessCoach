import type { AttackedPieceDto, EngineLine, TacticMotifType } from '@freechesscoach/shared';
import { applySanSequence } from './apply-san-sequence.js';
import { fenActiveColor } from './attack-map.js';
import { classifyCandidateMove } from './classify-candidate-move.js';
import { diffPositionFeatures } from './diff-features.js';
import { computePositionFeatures } from './position-features.js';

export interface CandidateMoveAnnotation {
  moveSan: string;
  createsFork: boolean;
  createsHangingPiece: boolean;
  /** `createsHangingPiece` split by whose piece is newly hanging —
   * `createsHangingPiece` itself doesn't distinguish the mover's own piece
   * (a genuine blunder) from the opponent's (a genuine attacking threat),
   * which conflated the two under bot-move-pick.ts's "aggression" weight
   * (see docs/plan.md Phase 62). Both are subsets of `createsHangingPiece`
   * (their OR); existing callers reading `createsHangingPiece` are
   * unaffected. */
  createsOwnHangingPiece: boolean;
  createsOpponentHangingPiece: boolean;
  createsUnderDefendedPiece: boolean;
  /** True when a piece of the mover's own color was already hanging in
   * `fenBefore` (an existing capture/threat available to the opponent) and
   * the same piece (same square/piece/color) is still hanging in
   * `fenAfter` — the candidate ignored it rather than defending it, moving
   * it, or trading it off. Cheap proxy for `MS-02`/`MS-03` (opponent
   * capture/threat scan omission, see docs/plan.md Phase 62) — a real
   * per-move detector run (Task 62.4) is the accuracy backstop; this only
   * needs to be good enough to steer sampling. */
  ignoresOwnHangingPiece: boolean;
  /** Mirror of `ignoresOwnHangingPiece` for the opponent's pieces: true
   * when an opponent piece was already hanging in `fenBefore` and the
   * candidate doesn't capture it — cheap proxy for `BV-02` (opponent
   * hanging-piece blindness: "fails to take free enemy pieces despite
   * adequate time"), see docs/plan.md Phase 62. */
  ignoresOpponentHangingPiece: boolean;
  mobilityDelta: number;
  /** The move's full tactic motif (fork/pin/discoveredAttack/.../other),
   * classified via the same registry (Phase 32) the batch pipeline uses —
   * a superset of `createsFork`, which callers are free to keep reading
   * unchanged. */
  motif: TacticMotifType | null;
}

export interface AnnotateCandidateMovesOptions {
  /** Defaults to `fenBefore`'s own active-color field. */
  mover?: 'white' | 'black';
  /** White-perspective engine lines at `fenBefore`, if the caller has them —
   * see `ClassifyCandidateMoveOptions.linesAtFenBefore`. */
  linesAtFenBefore?: EngineLine[];
}

function underDefendedPieceKey(piece: AttackedPieceDto): string {
  return `${piece.square}:${piece.piece}:${piece.color}`;
}

function hangingPieceKey(piece: AttackedPieceDto): string {
  return `${piece.square}:${piece.piece}:${piece.color}`;
}

/**
 * Annotates each candidate SAN move (e.g. moves the coach is considering
 * suggesting) with the concrete tactical consequences of playing it from
 * `fenBefore` — reusing applySanSequence/computePositionFeatures/
 * diffPositionFeatures rather than re-deriving move application or tactic
 * detection here. Illegal candidates are silently omitted rather than
 * thrown, since the caller may be probing engine-suggested SAN strings it
 * hasn't otherwise validated.
 */
export function annotateCandidateMoves(
  fenBefore: string,
  candidateSanMoves: string[],
  options: AnnotateCandidateMovesOptions = {}
): CandidateMoveAnnotation[] {
  const mover = options.mover ?? fenActiveColor(fenBefore);
  const featuresBefore = computePositionFeatures(fenBefore);
  const underDefendedBeforeKeys = new Set(featuresBefore.underDefendedPieces.map(underDefendedPieceKey));
  const ownHangingBeforeKeys = new Set(
    featuresBefore.hangingPieces.filter((piece) => piece.color === mover).map(hangingPieceKey)
  );
  const opponentHangingBeforeKeys = new Set(
    featuresBefore.hangingPieces.filter((piece) => piece.color !== mover).map(hangingPieceKey)
  );

  const annotations: CandidateMoveAnnotation[] = [];
  for (const moveSan of candidateSanMoves) {
    const applied = applySanSequence(fenBefore, [moveSan]);
    if (applied.error !== null) continue;

    const fenAfter = applied.moves[0]?.fen;
    if (fenAfter === undefined) continue;

    const featuresAfter = computePositionFeatures(fenAfter);
    const delta = diffPositionFeatures(featuresBefore, featuresAfter);
    const createsUnderDefendedPiece = featuresAfter.underDefendedPieces.some(
      (piece) => !underDefendedBeforeKeys.has(underDefendedPieceKey(piece))
    );

    annotations.push({
      moveSan,
      createsFork: delta.newForks.length > 0,
      createsHangingPiece: delta.newHangingPieces.length > 0,
      createsOwnHangingPiece: delta.newHangingPieces.some((piece) => piece.color === mover),
      createsOpponentHangingPiece: delta.newHangingPieces.some((piece) => piece.color !== mover),
      createsUnderDefendedPiece,
      ignoresOwnHangingPiece: featuresAfter.hangingPieces.some(
        (piece) => piece.color === mover && ownHangingBeforeKeys.has(hangingPieceKey(piece))
      ),
      ignoresOpponentHangingPiece: featuresAfter.hangingPieces.some(
        (piece) => piece.color !== mover && opponentHangingBeforeKeys.has(hangingPieceKey(piece))
      ),
      mobilityDelta: delta.mobilityDelta,
      motif: classifyCandidateMove(fenBefore, moveSan, mover, { linesAtFenBefore: options.linesAtFenBefore })
    });
  }

  return annotations;
}
