import { Chess, type Color, type Move, type Square } from 'chess.js';
import type { ChecksCapturesThreats } from '@freechesscoach/shared';
import { buildAttackMap } from '../attack-map.js';
import { CONFIG } from '../config.js';
import { see } from '../see.js';
import { defendersOf, enemyTargetsOf, kingSquareOf, pieceValueAt } from '../tactic-board-facts.js';

type CaptureMove = ChecksCapturesThreats['captures']['moves'][number];
type CheckMove = ChecksCapturesThreats['checks']['moves'][number];
type QuietThreatMove = ChecksCapturesThreats['threats']['moves'][number];

const { minThreatSeeCp: MIN_THREAT_SEE_CP } = CONFIG.evalWitness;
/** A check only matters beyond itself when it also hits a minor piece or more
 * (`PIECE_VALUES` pawns). */
const MIN_CHECK_TARGET_VALUE = 3;

/**
 * The static "is this forcing move dangerous?" rules behind
 * `threat-inventory.ts`. Every function takes `fen` with the opponent (the
 * side that would play the move) to move, and returns the square the danger
 * lands on, or `null` when the move is harmless. Pure board facts: SEE and
 * attack maps, no engine.
 */

/** A capture is dangerous when the whole exchange wins at least a pawn. */
export function dangerousCaptureTarget(fen: string, move: CaptureMove): Square | null {
  const target = move.to as Square;
  return see(fen, target, sideToMove(fen)) >= MIN_THREAT_SEE_CP ? target : null;
}

/**
 * A check is dangerous when it mates, or when the checker cannot be won on
 * its landing square and also attacks a mover piece worth a minor or more
 * that is undefended or worth more than the checker. Returns the mover's
 * king square.
 */
export function dangerousCheckTarget(fen: string, move: CheckMove): Square | null {
  const after = replay(fen, move.moveSan);
  if (!after) return null;
  const mover = after.turn();
  const kingSquare = kingSquareOf(after, mover);
  if (!kingSquare) return null;
  if (move.isCheckmate) return kingSquare;
  if (see(after.fen(), move.to as Square, mover) > 0) return null;
  return checkerHitsValuablePiece(after, move.to as Square, mover) ? kingSquare : null;
}

/**
 * A quiet threat is dangerous when the threatening piece lands safely and
 * one of the pieces it newly attacks can then be won for at least a pawn.
 * Returns the most profitable such target.
 */
export function dangerousQuietThreatTarget(fen: string, move: QuietThreatMove): Square | null {
  const after = replay(fen, move.moveSan);
  if (!after) return null;
  const afterFen = after.fen();
  const mover = after.turn();
  if (see(afterFen, move.to as Square, mover) > 0) return null;

  const opponent = sideToMove(fen);
  const scored = move.targetedPieces
    .map((piece) => ({ square: piece.square as Square, gain: see(afterFen, piece.square as Square, opponent) }))
    .filter((entry) => entry.gain >= MIN_THREAT_SEE_CP)
    .sort((left, right) => right.gain - left.gain);
  return scored[0]?.square ?? null;
}

/** A direct threat is a mate in one, or a promotion the mover cannot
 * profitably capture on the promotion square. `move` is a legal move of the
 * side to move in `fen`. */
export function directThreatTarget(fen: string, move: Move): Square | null {
  if (move.san.endsWith('#')) return move.to;
  if (!move.promotion) return null;
  const after = replay(fen, move.san);
  if (!after) return null;
  return see(after.fen(), move.to, after.turn()) <= 0 ? move.to : null;
}

function checkerHitsValuablePiece(after: Chess, checker: Square, mover: Color): boolean {
  const attackMap = buildAttackMap(after);
  const checkerValue = pieceValueAt(after, checker);
  return enemyTargetsOf(after, attackMap, checker, mover).some((square) => {
    const value = pieceValueAt(after, square);
    if (value < MIN_CHECK_TARGET_VALUE) return false;
    return defendersOf(attackMap, square, mover).length === 0 || value > checkerValue;
  });
}

function replay(fen: string, moveSan: string): Chess | null {
  try {
    const chess = new Chess(fen);
    chess.move(moveSan);
    return chess;
  } catch {
    return null;
  }
}

function sideToMove(fen: string): Color {
  return new Chess(fen).turn();
}
