import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { opponentOf } from '../attack-map.js';
import { CONFIG } from '../config.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import { see } from '../see.js';

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
  const opponent = opponentOf(owner);
  const turn = new Chess(fen).turn();
  const seat = turn === opponent ? fen : flipActiveColorFen(fen);
  if (!seat) return [];
  const chess = new Chess(seat);
  const capturable = new Set(chess.moves({ verbose: true }).filter((move) => move.captured).map((move) => move.to));
  const loose: LoosePiece[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== owner || cell.type === 'k' || !capturable.has(cell.square)) continue;
      // `see` also counts recaptures through the piece taken (the Englund's
      // rook on a1 sits behind the queen on b2: taking it loses the queen).
      if (see(seat, cell.square, opponent) < MIN_WON_SEE_CP) continue;
      const tier = chess.attackers(cell.square, owner).length === 0 ? 'free' : 'winnable';
      loose.push({ square: cell.square, piece: cell.type, owner, tier });
    }
  }
  return loose;
}

const keyOf = (piece: LoosePiece): string => `${piece.square}:${piece.piece}:${piece.owner}`;

/** Both sides' loose pieces in `fenAfter` that were not loose (same piece, same
 * square) in `fenBefore`. */
export function newLoosePieces(fenBefore: string, fenAfter: string): LoosePiece[] {
  const before = new Set([...loosePieces(fenBefore, 'w'), ...loosePieces(fenBefore, 'b')].map(keyOf));
  return [...loosePieces(fenAfter, 'w'), ...loosePieces(fenAfter, 'b')].filter((piece) => !before.has(keyOf(piece)));
}
