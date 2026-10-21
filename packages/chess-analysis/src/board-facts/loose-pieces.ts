import type { Color, PieceSymbol, Square } from 'chess.js';
import { attackersOf, colorOf, FastBoard, indexOf, squareOf, symbolOf } from '../fast-board/board.js';
import { legalMoves } from '../fast-board/moves.js';
import { opponentOf } from '../attack-map.js';
import { CONFIG } from '../config.js';
import { seeOnBoard } from '../see.js';

/** One pawn on `see`'s scale: the least an exchange has to win. `see` prices
 * a bishop 10 centipawns above a knight, so a knight taking a defended bishop
 * comes out at +10, and that is an even trade, not a won piece. */
const { minThreatSeeCp: MIN_WON_SEE_CP } = CONFIG.evalWitness;

export interface LoosePiece {
  square: Square;
  piece: PieceSymbol;
  owner: Color;
  /** `free`: it can be taken and nothing defends it. `winnable`: defended,
   * but the whole exchange still comes out ahead for the taker (a knight
   * attacked by a pawn). Both need `see` to win at least a pawn. */
  tier: 'free' | 'winnable';
}

/** The pieces of `owner` the other side could win, looked at from the
 * opponent's seat: a legal capture must exist (a pinned attacker cannot
 * take), and the whole exchange on the square (`see`) decides `winnable`.
 * Kings are never loose. If it is `owner`'s turn the position is read with
 * the turn passed; when passing is illegal (`owner` is in check, so the
 * flipped position would be illegal) the answer is `[]`. */
export function loosePieces(fen: string, owner: Color): LoosePiece[] {
  return looseAmong(fen, owner, null);
}

/** `loosePieces` asked about some squares only (null: all of them): only
 * the attackers of those squares generate their moves. */
export function looseAmong(fen: string, owner: Color, squares: readonly Square[] | null): LoosePiece[] {
  const opponent = opponentOf(owner);
  const board = FastBoard.fromFen(fen);
  // Read from the opponent's seat: passing is illegal when `owner` is in check.
  if (board.turn !== opponent && board.inCheck(owner)) return [];
  board.turn = opponent;
  board.ep = -1;
  // Board order, as the answer always was.
  const asked = squares === null ? allSquares() : [...new Set(squares.map(indexOf))].sort((a, b) => a - b);
  const movers = squares === null ? legalMoves(board) : [...new Set(asked.flatMap((index) => attackersOf(board, index, opponent)))].flatMap((from) => legalMoves(board, from));
  const capturable = new Set(movers.filter((move) => move.captured && asked.includes(move.to)).map((move) => move.to));
  const loose: LoosePiece[] = [];
  for (const index of asked) {
    const piece = board.squares[index] ?? 0;
    if (!piece || colorOf(piece) !== owner || symbolOf(piece) === 'k' || !capturable.has(index)) continue;
    // `see` also counts recaptures through the piece taken (the Englund's
    // rook on a1 sits behind the queen on b2: taking it loses the queen).
    if (seeOnBoard(board, index) < MIN_WON_SEE_CP) continue;
    const tier = attackersOf(board, index, owner).length === 0 ? 'free' : 'winnable';
    loose.push({ square: squareOf(index), piece: symbolOf(piece), owner, tier });
  }
  return loose;
}

const allSquares = (): number[] => Array.from({ length: 64 }, (_, index) => index);

const keyOf = (piece: LoosePiece): string => `${piece.square}:${piece.piece}:${piece.owner}`;

/** Both sides' loose pieces in `fenAfter` that were not loose (same piece, same
 * square) in `fenBefore`. */
export function newLoosePieces(fenBefore: string, fenAfter: string): LoosePiece[] {
  const before = new Set([...loosePieces(fenBefore, 'w'), ...loosePieces(fenBefore, 'b')].map(keyOf));
  return [...loosePieces(fenAfter, 'w'), ...loosePieces(fenAfter, 'b')].filter((piece) => !before.has(keyOf(piece)));
}
