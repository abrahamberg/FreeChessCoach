import { Chess, type Square } from 'chess.js';

export interface CheckedKing {
  square: string;
  mated: boolean;
  /** A mated king's empty neighbour squares, each one attacked: where it
   * wanted to run. Shown shut, so the mate reads without a word. */
  shut: string[];
}

/** The king in check in `fen`: what the board lights (CoachBoard) and a
 * course's film draws; `{}` when no king is in check. */
export function checkedKing(fen: string): { king?: CheckedKing } {
  const chess = new Chess(fen);
  const square = chess.inCheck() ? chess.findPiece({ type: 'k', color: chess.turn() })[0] : undefined;
  if (!square) return {};
  const mated = chess.isCheckmate();
  return { king: { square, mated, shut: mated ? shutSquares(chess, square) : [] } };
}

/** The empty squares beside the king that the other side attacks. */
function shutSquares(chess: Chess, king: Square): string[] {
  const attacker = chess.turn() === 'w' ? 'b' : 'w';
  const file = king.charCodeAt(0);
  const rank = Number(king[1]);
  const beside = [-1, 0, 1].flatMap((df) => [-1, 0, 1].map((dr) => `${String.fromCharCode(file + df)}${rank + dr}`)).filter((name) => /^[a-h][1-8]$/.test(name) && name !== king) as Square[];
  return beside.filter((name) => !chess.get(name) && chess.isAttacked(name, attacker));
}
