import { Chess, type Move } from 'chess.js';
import { PIECE_NAMES } from '../../piece-names.js';
import type { VerdictContext } from '../context.js';
import { netPawns } from '../line-value.js';
import type { MoveVerdictCard } from '../types.js';

/**
 * The allowed card when no detector names the reply, but the reply simply
 * takes something and keeps it: its first move is a capture, and the
 * refutation's material walk nets the mover a loss. The caller still needs
 * the eval gap to confirm it (`checkAllowedTactic`), so this is material the
 * eval agrees was lost, not a shape.
 *
 * Why it exists: the claim verifier (`verify-tactic-*`, out of scope here)
 * rejects a free capture whose capturing piece later retreats — 4.Nd5?
 * Nxe4 5.Qd3 Nf6 keeps the pawn, but reads as no tactic — so without this a
 * move that just hung a pawn had no tier-1 reason and "missed a chance to
 * develop" became its verdict.
 */
export function hungMaterialCard(ctx: VerdictContext): MoveVerdictCard['tacticAllowed'] {
  const reply = ctx.frame.afterLine;
  const fenAfter = ctx.input.move.fenAfter;
  if (!reply || !fenAfter) return undefined;

  const capture = replayed(fenAfter, reply.moveSan);
  const lost = -netPawns(ctx.playedWalk.get());
  if (!capture?.captured || lost < 1) return undefined;

  const prize = PIECE_NAMES[capture.captured];
  return {
    type: 'freePiece',
    detail: `captures the ${prize} on ${capture.to}`,
    visual: { arrows: [{ from: capture.from, to: capture.to }], highlights: [] },
    gain: { kind: 'material', pawns: lost, prize },
    byMoveSan: capture.san
  };
}

function replayed(fen: string, san: string): Move | null {
  try {
    return new Chess(fen).move(san);
  } catch {
    return null;
  }
}
