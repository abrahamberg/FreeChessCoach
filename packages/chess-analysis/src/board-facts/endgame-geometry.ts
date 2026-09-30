import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { BoardFact } from './types.js';

/** King-and-pawn geometry, stated where it decides the game and only with
 * kings and pawns on the board: the opposition after a king move, and a
 * passed pawn the enemy king cannot catch (the rule of the square). */
export function endgameGeometry(fenAfter: string, piece: PieceSymbol, to: Square): BoardFact[] {
  const chess = new Chess(fenAfter);
  const cells = chess.board().flat().filter((cell) => cell !== null);
  // Stalemate ends it: no king has to give way (the rook's-pawn draw's 3.a7).
  if (cells.some((cell) => cell.type !== 'k' && cell.type !== 'p') || chess.isGameOver()) return [];
  const mover = chess.turn() === 'w' ? 'b' : 'w';
  const own = chess.findPiece({ type: 'k', color: mover })[0];
  const enemy = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  if (!own || !enemy) return [];
  const file = (square: string): number => square.charCodeAt(0) - 97;
  const rank = (square: string): number => Number(square[1]);
  const facts: BoardFact[] = [];
  if (piece === 'k') {
    const [ownFile, ownRank] = [file(own), rank(own)];
    const [enemyFile, enemyRank] = [file(enemy), rank(enemy)];
    const facing = (ownFile === enemyFile && Math.abs(ownRank - enemyRank) === 2) || (ownRank === enemyRank && Math.abs(ownFile - enemyFile) === 2);
    if (facing) facts.push({ kind: 'opposition' });
  }
  if (piece === 'p') {
    const up = mover === 'w' ? 1 : -1;
    const promotion = `${to[0]}${mover === 'w' ? 8 : 1}`;
    const ahead = cells.some((cell) => cell.type === 'p' && cell.color !== mover && Math.abs(file(cell.square) - file(to)) <= 1 && (rank(cell.square) - rank(to)) * up > 0);
    const steps = mover === 'w' ? 8 - rank(to) : rank(to) - 1;
    const distance = Math.max(Math.abs(file(enemy) - file(promotion)), Math.abs(rank(enemy) - rank(promotion)));
    if (!ahead && distance > steps) facts.push({ kind: 'outsideSquare', king: { side: mover === 'w' ? 'black' : 'white', square: enemy } });
  }
  return facts;
}
