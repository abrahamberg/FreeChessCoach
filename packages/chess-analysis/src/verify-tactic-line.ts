import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { TacticHorizon, TacticMotifType } from '@freechesscoach/shared';
import { applySanSequence } from './apply-san-sequence.js';
import { CONFIG } from './config.js';
import { materialBalance } from './tactic-board-facts.js';
import type { TacticDetectionContext } from './tactic-detectors/context.js';
import type { VerifiedTacticClaim } from './verify-tactic-claims.js';

/** Below this the PV says nothing useful: one ply is the move itself, two is
 * the move and a reply, and a claim can't be shown to pay off in either. */
const MIN_USABLE_PV_PLIES = 3;

/**
 * Layer 2's other half: does the engine's own continuation actually cash the
 * claim in?
 *
 * `verify-tactic-claims.ts` asks what the board shows. This asks what the
 * line does, which is the question `docs/tactics-rework.md` §2 measured as
 * the difference between a 22.4% and a 2.5% false-positive rate, and the same
 * question Lichess's tagger rests on — it tags themes over an engine-verified
 * solution line, never a single ply in isolation.
 *
 * Three tests, per §5 layer 2:
 *
 * - **Material** — does the mover's material rise by `minLineGainPawns`
 *   inside the walked plies, or is it mate?
 * - **Attribution** — is that material won *on one of the claim's own target
 *   squares*, or by the claim's own actor? This is what separates "the fork
 *   won the rook" from "something good happened four moves later".
 * - **Horizon** — which ply paid, so the card can say "an *eventual* fork"
 *   rather than implying it happens now.
 *
 * A claim that promises material and isn't paid in the line is dropped. A
 * claim that promises a bind, a tempo or a piece saved is left exactly as the
 * static pass left it: the line has nothing to say about it either way, and
 * dropping it for failing a test it was never taking is how a verifier
 * deletes the defensive vocabulary.
 */
export function verifyTacticClaimsAgainstLine(
  context: TacticDetectionContext,
  claims: readonly VerifiedTacticClaim[],
  pvSan: readonly string[]
): VerifiedTacticClaim[] {
  const line = walkLine(context, pvSan);
  if (!line) return [...claims];

  return claims
    .map((claim) => verifyOne(claim, line))
    .filter((claim): claim is VerifiedTacticClaim => claim !== null);
}

export interface MaterialLineStep {
  ply: number;
  /** The mover's material advantage after this ply, in pawns, relative to
   * what it was before the move. */
  gain: number;
  /** Where the mover captured on this ply, if it did. */
  capturedOn: Square | null;
  /** Where that capture came from — a claim is also attributed when its own
   * actor is the piece doing the winning. */
  capturedFrom: Square | null;
  /** The mover checkmated on this ply. */
  isMate: boolean;
  /** Odd plies (1, 3, ...) are the mover's own; even ones are the reply. */
  moverMoved: boolean;
  /** The piece taken on this ply, by either side. */
  capturedPiece: PieceSymbol | null;
  /** Either side checkmated on this ply. */
  isCheckmate: boolean;
}

function walkLine(context: TacticDetectionContext, pvSan: readonly string[]): MaterialLineStep[] | null {
  if (Math.min(pvSan.length, CONFIG.tacticVerification.maxLinePlies) < MIN_USABLE_PV_PLIES) return null;
  const steps = walkMaterialLine(context.fenBefore, context.mover, pvSan);
  return steps.length < MIN_USABLE_PV_PLIES ? null : steps;
}

/**
 * The material walk behind the line test, on its own: replays `pvSan` from
 * `fenBefore` (capped at `CONFIG.tacticVerification.maxLinePlies`, stopping
 * at the first illegal move) and reports the mover's material after every
 * ply. Pure; also read by `move-verdict/line-value.ts`.
 */
export function walkMaterialLine(fenBefore: string, mover: Color, pvSan: readonly string[]): MaterialLineStep[] {
  const walked = pvSan.slice(0, CONFIG.tacticVerification.maxLinePlies);
  const applied = applySanSequence(fenBefore, [...walked]);
  const before = materialBalance(new Chess(fenBefore), mover);
  const steps: MaterialLineStep[] = [];
  let previousFen = fenBefore;

  applied.moves.forEach((move, index) => {
    const board = new Chess(move.fen);
    const moverMoved = index % 2 === 0;
    const to = move.uci.slice(2, 4) as Square;
    const capturedPiece = new Chess(previousFen).get(to)?.type ?? null;
    const captured = moverMoved && capturedPiece !== null;
    const isCheckmate = board.isCheckmate();

    steps.push({
      ply: index + 1,
      gain: materialBalance(board, mover) - before,
      capturedOn: captured ? to : null,
      capturedFrom: captured ? (move.uci.slice(0, 2) as Square) : null,
      isMate: isCheckmate && moverMoved,
      moverMoved,
      capturedPiece,
      isCheckmate
    });
    previousFen = move.fen;
  });
  return steps;
}

function verifyOne(claim: VerifiedTacticClaim, line: MaterialLineStep[]): VerifiedTacticClaim | null {
  if (claim.gainKind !== 'material' && claim.gainKind !== 'mate') return claim;

  const paid = line.find((step) => (step.isMate || step.gain >= CONFIG.tacticVerification.minLineGainPawns) && attributes(claim, line, step));
  if (!paid) return null;

  return {
    ...claim,
    confidence: Math.max(claim.confidence, 0.95),
    verifiedGain: paid.isMate ? claim.verifiedGain : paid.gain,
    horizon: horizonOf(paid.ply),
    verifiedBy: 'line'
  };
}

/**
 * Was the payoff this claim's doing? Material won anywhere in the line is not
 * evidence for a fork three moves earlier — the shape has to be the thing
 * that collected, either on a square it named or with the piece it named.
 * Mate is attributed unconditionally: a claim that leads to mate led to mate.
 */
function attributes(claim: VerifiedTacticClaim, line: MaterialLineStep[], paid: MaterialLineStep): boolean {
  if (paid.isMate) return true;
  const squares = payoffSquares(claim);

  return line
    .filter((step) => step.ply <= paid.ply && step.capturedOn !== null)
    .some((step) => squares.has(step.capturedOn!) || step.capturedFrom === claim.actor);
}

/**
 * Where a claim's payoff is allowed to land.
 *
 * Normally that is the squares it named. A claim that binds a piece along a
 * ray has one more: the answer to `Bb5` is `Qxb5`, so the queen the pin wins
 * is collected on the *pinner's* own square, and attributing only to the
 * pinned square drops the claim on the exact line that proves it. Restricted
 * to the ray motifs on purpose — for a fork, material on the forker's square
 * means the forker was traded off, which is the opposite of the fork paying.
 */
function payoffSquares(claim: VerifiedTacticClaim): Set<Square> {
  const squares = new Set<Square>([...claim.targets, ...(claim.victim ? [claim.victim] : [])]);
  if (RAY_BIND_MOTIFS.has(claim.type)) squares.add(claim.actor);
  return squares;
}

const RAY_BIND_MOTIFS: ReadonlySet<TacticMotifType> = new Set(['pin', 'skewer', 'xRayAttack']);

function horizonOf(ply: number): TacticHorizon {
  if (ply <= 1) return 'immediate';
  if (ply <= 3) return 'inTwo';
  return 'eventual';
}
