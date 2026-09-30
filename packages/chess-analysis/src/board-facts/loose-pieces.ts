import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { opponentOf } from '../attack-map.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import { see } from '../see.js';

export interface LoosePiece {
  square: Square;
  piece: PieceSymbol;
  owner: Color;
  /** `free`: it can be taken and nothing defends it. `winnable`: defended,
   * but the whole exchange still comes out ahead for the taker (a knight
   * attacked by a pawn). Both need `see > 0`. */
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
      const gain = see(seat, cell.square, opponent);
      // `see` also counts recaptures through the piece taken (the Englund's
      // rook on a1 sits behind the queen on b2: taking it loses the queen).
      if (gain <= 0) continue;
      const tier = chess.attackers(cell.square, owner).length === 0 ? 'free' : 'winnable';
      loose.push({ square: cell.square, piece: cell.type, owner, tier });
    }
  }
  return loose;
}
