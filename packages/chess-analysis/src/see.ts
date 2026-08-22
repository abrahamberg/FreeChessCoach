import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import type { ColorName } from './attack-map.js';

const SEE_PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000
};

/**
 * Evaluates the exchange on a square from the first side's perspective.
 * Captures are selected by least valuable attacker, while every replying side
 * may stand pat instead of continuing an unprofitable exchange.
 */
export function see(fen: string, targetSquare: Square, sideToMove: SeeColor): number {
  const side = toChessColor(sideToMove);
  return evaluateCapture(withSideToMove(fen, side), targetSquare, side);
}

/**
 * Finds the worst capture the opponent can make after a move. The returned
 * score is from the mover's perspective, so a piece that is simply lost is a
 * negative value.
 */
export function seeOnAllOpponentCaptures(fenAfterMove: string, movingColor: SeeColor): number {
  const mover = toChessColor(movingColor);
  const opponent = oppositeColor(mover);
  const chess = new Chess(withSideToMove(fenAfterMove, opponent));
  const captures = chess.moves({ verbose: true }).filter(isCapture);

  if (captures.length === 0) return 0;

  return Math.min(...captures.map((move) => -see(fenAfterMove, move.to, opponent)));
}

function evaluateCapture(fen: string, targetSquare: Square, sideToMove: Color): number {
  const chess = new Chess(withSideToMove(fen, sideToMove));
  const capture = leastValuableCapture(chess, targetSquare);

  if (!capture) return 0;

  const capturedValue = SEE_PIECE_VALUES[capture.captured];
  chess.move({ from: capture.from, to: capture.to, promotion: capture.promotion });

  const opponentGain = evaluateCapture(chess.fen(), targetSquare, oppositeColor(sideToMove));
  return capturedValue - Math.max(0, opponentGain);
}

function leastValuableCapture(chess: Chess, targetSquare: Square): CaptureMove | null {
  const captures = chess.moves({ verbose: true })
    .filter(isCapture)
    .filter((move) => move.to === targetSquare);

  return captures.reduce<CaptureMove | null>(selectLowerValueCapture, null);
}

function selectLowerValueCapture(selected: CaptureMove | null, candidate: CaptureMove): CaptureMove {
  if (!selected) return candidate;

  const selectedValue = SEE_PIECE_VALUES[selected.piece];
  const candidateValue = SEE_PIECE_VALUES[candidate.piece];
  if (candidateValue < selectedValue) return candidate;
  if (candidateValue > selectedValue) return selected;

  return captureKey(candidate) < captureKey(selected) ? candidate : selected;
}

function captureKey(move: CaptureMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function isCapture(move: Move): move is CaptureMove {
  return move.captured !== undefined;
}

function withSideToMove(fen: string, sideToMove: Color): string {
  const fields = fen.trim().split(/\s+/);
  fields[1] = sideToMove;
  return fields.join(' ');
}

function toChessColor(color: SeeColor): Color {
  return color === 'w' || color === 'white' ? 'w' : 'b';
}

function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

type CaptureMove = Move & { captured: PieceSymbol };

export type SeeColor = Color | ColorName;
