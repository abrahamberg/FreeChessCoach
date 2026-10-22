import type { Color, PieceSymbol, Square } from 'chess.js';
import { attackersOf, FastBoard, type FastMove, indexOf, squareOf, symbolOf } from './fast-board/board.js';
import { legalMoves } from './fast-board/moves.js';
import type { ColorName } from './attack-map.js';

/** The exchange's piece values, in centipawns. */
export const SEE_PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20_000
};

/** A bishop against a knight on this scale: the one difference between two
 * pieces that is no material at all. */
export const BISHOP_KNIGHT_GAP_CP = SEE_PIECE_VALUES.b - SEE_PIECE_VALUES.n;

/**
 * Evaluates the exchange on a square from the first side's perspective.
 * Captures are selected by least valuable attacker, while every replying side
 * may stand pat instead of continuing an unprofitable exchange.
 */
export function see(fen: string, targetSquare: Square, sideToMove: SeeColor): number {
  return evaluateCapture(boardFor(fen, toChessColor(sideToMove)), indexOf(targetSquare));
}

/**
 * Finds the worst capture the opponent can make after a move. The returned
 * score is from the mover's perspective, so a piece that is simply lost is a
 * negative value. Each target square is resolved once: the exchange on a
 * square does not depend on which capture was listed first.
 */
export function seeOnAllOpponentCaptures(fenAfterMove: string, movingColor: SeeColor, credit?: { square: string; value: number }): number {
  const opponent = oppositeColor(toChessColor(movingColor));
  const board = boardFor(fenAfterMove, opponent);
  const targets = new Set(legalMoves(board).filter(isCapture).map((move) => move.to));

  if (targets.size === 0) return 0;

  // `credit`: what the move itself just took on `square`, so a knight taking a
  // rook and being taken back is +rook-knight, not a lost knight.
  return Math.min(...[...targets].map((target) => -evaluateCapture(board, target) + (credit && credit.square === squareOf(target) ? credit.value : 0)));
}

/** `see` on a board already set up: the side to move takes on `target`.
 * The board is played on and given back as it was. */
export function seeOnBoard(board: FastBoard, target: number): number {
  return evaluateCapture(board, target);
}

/** The position with `side` to move and no en-passant square (see `withSideToMove`). */
function boardFor(fen: string, side: Color): FastBoard {
  const board = FastBoard.fromFen(withSideToMove(fen, side));
  board.turn = side;
  board.ep = -1;
  return board;
}

/** The exchange on `target` for the side to move, played and taken back on
 * the one board (the fast board: chess.js's SAN for every move made SEE most
 * of a review's time). */
function evaluateCapture(board: FastBoard, target: number): number {
  const capture = leastValuableCapture(board, target);

  if (!capture) return 0;

  const capturedValue = SEE_PIECE_VALUES[symbolOf(capture.captured)];
  board.make(capture);
  const opponentGain = evaluateCapture(board, target);
  board.unmake();
  return capturedValue - Math.max(0, opponentGain);
}

/** Only the pieces attacking the square generate their moves. */
function leastValuableCapture(board: FastBoard, target: number): FastMove | null {
  const captures = attackersOf(board, target, board.turn)
    .flatMap((from) => legalMoves(board, from))
    .filter((move) => move.to === target && isCapture(move));

  return captures.reduce<FastMove | null>(selectLowerValueCapture, null);
}

function selectLowerValueCapture(selected: FastMove | null, candidate: FastMove): FastMove {
  if (!selected) return candidate;

  const selectedValue = SEE_PIECE_VALUES[symbolOf(selected.piece)];
  const candidateValue = SEE_PIECE_VALUES[symbolOf(candidate.piece)];
  if (candidateValue < selectedValue) return candidate;
  if (candidateValue > selectedValue) return selected;

  return captureKey(candidate) < captureKey(selected) ? candidate : selected;
}

function captureKey(move: FastMove): string {
  return `${squareOf(move.from)}${squareOf(move.to)}${move.promotion ? symbolOf(move.promotion) : ''}`;
}

/**
 * King captures are excluded, not merely undervalued.
 *
 * SEE sets the side to move artificially, so it routinely asks about a
 * position whose *other* king is already attacked — and chess.js answers
 * that by generating a legal capture of that king. Playing it produces a
 * FEN with one king missing, which chess.js then refuses to load, so the
 * recursion throws rather than returning a score. A king is never material
 * in an exchange either way: `SEE_PIECE_VALUES` prices it at 20,000
 * precisely so no sequence ever chooses to trade for it.
 */
function isCapture(move: FastMove): boolean {
  return move.captured !== 0 && symbolOf(move.captured) !== 'k';
}

/**
 * Sets a FEN's side to move, clearing en-passant rights along with it.
 *
 * The clear is load-bearing rather than tidiness: an en-passant target
 * square belongs to the side that was about to move, so a FEN that keeps it
 * while naming the *other* side to move is not a legal position, and
 * `chess.js` rejects it outright. SEE asks "what if this side could capture
 * on that square right now", which is exactly that flip, so without the
 * clear every SEE on a position one square after a double pawn push throws.
 * Nothing is lost: SEE resolves an exchange on one named square, and an
 * en-passant capture never lands on the square of the pawn it takes.
 */
function withSideToMove(fen: string, sideToMove: Color): string {
  const fields = fen.trim().split(/\s+/);
  fields[1] = sideToMove;
  fields[3] = '-';
  return fields.join(' ');
}

function toChessColor(color: SeeColor): Color {
  return color === 'w' || color === 'white' ? 'w' : 'b';
}

function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

export type SeeColor = Color | ColorName;
