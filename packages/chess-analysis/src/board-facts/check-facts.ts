import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { BoardFact, PieceAt } from './types.js';

const pieceAt = (chess: Chess, square: Square): PieceAt => ({ piece: chess.get(square)!.type, square });

/** Who gives the check when the moved piece is not the only one: the
 * Petrov's 5.Nc6+ is the queen on e2's check, which "gives check" hid. */
export function discovered(fenAfter: string, to: Square): BoardFact[] {
  const chess = new Chess(fenAfter);
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  if (!king) return [];
  const checkers = chess.attackers(king, chess.turn() === 'w' ? 'b' : 'w');
  const others = checkers.filter((square) => square !== to).map((square) => pieceAt(chess, square));
  if (!others.length) return [];
  return checkers.includes(to) ? [{ kind: 'doubleCheck', others }] : [{ kind: 'discoveredCheck', checkers: others }];
}

/** The Lucena's 7.Rb4 builds the bridge by blocking a check: the one fact
 * the course is about, and the board facts never said it. */
export function blockedCheck(fenBefore: string, piece: PieceSymbol, to: string): BoardFact[] {
  const chess = new Chess(fenBefore);
  if (!chess.inCheck() || piece === 'k') return [];
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  const checkers = king ? chess.attackers(king, chess.turn() === 'w' ? 'b' : 'w') : [];
  const checker = checkers.length === 1 ? checkers[0] : undefined;
  if (!checker || checker === to) return [];
  return [{ kind: 'blocksCheck', checker: pieceAt(chess, checker) }];
}

/** Mate by a piece on the king's own back rank, checking along it. */
export function isBackRankMate(fenAfter: string, checker: Square): boolean {
  const chess = new Chess(fenAfter);
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  const backRank = chess.turn() === 'w' ? '1' : '8';
  return king !== undefined && king[1] === backRank && checker[1] === backRank;
}

/** Why it is mate, square by square: which of the king's squares hold its
 * own pieces, which are covered and by what, and which adjacent attackers
 * are guarded. gemma-4-12b invented "Nd5# saves your knight on e5" when the
 * dossier only said "gives checkmate". */
export function mateNet(fenAfter: string): BoardFact[] {
  const chess = new Chess(fenAfter);
  const side = chess.turn();
  const enemy = side === 'w' ? 'b' : 'w';
  const king = chess.findPiece({ type: 'k', color: side })[0];
  if (!king) return [];
  // The king's own square blocks the lines through it: with it on the board,
  // Qc1# read "h1 is covered by " (the queen sees h1 once the king steps there).
  const lifted = new Chess(fenAfter);
  lifted.remove(king);
  const ownSquares: Square[] = [];
  const covered = new Map<string, { squares: Square[]; by: PieceAt[] }>();
  const guarded: { piece: PieceAt; by: PieceAt[] }[] = [];
  for (const square of kingNeighbours(king)) {
    const piece = chess.get(square);
    const by = lifted.attackers(square, enemy).map((from) => pieceAt(chess, from));
    if (piece?.color === side) ownSquares.push(square);
    else if (piece) guarded.push({ piece: pieceAt(chess, square), by });
    else {
      const key = by.map((cover) => cover.square).join();
      const group = covered.get(key) ?? { squares: [], by };
      group.squares.push(square);
      covered.set(key, group);
    }
  }
  return [{ kind: 'mateNet', king, checkers: chess.attackers(king, enemy).map((from) => pieceAt(chess, from)), ownSquares, covered: [...covered.values()], guarded }];
}

function kingNeighbours(king: Square): Square[] {
  const file = king.charCodeAt(0);
  const rank = Number(king[1]);
  const squares: Square[] = [];
  for (const df of [-1, 0, 1]) {
    for (const dr of [-1, 0, 1]) {
      const f = file + df;
      const r = rank + dr;
      if ((df || dr) && f >= 97 && f <= 104 && r >= 1 && r <= 8) squares.push(`${String.fromCharCode(f)}${r}` as Square);
    }
  }
  return squares;
}

/** How the checked side can answer, so a script can't say "forces the king
 * to move" when a block exists (gemma-4-12b did, on 4...Qb4+). */
export function checkAnswers(fenAfter: string): BoardFact[] {
  const chess = new Chess(fenAfter);
  const checker = chess.attackers(chess.findPiece({ type: 'k', color: chess.turn() })[0] as Square, chess.turn() === 'w' ? 'b' : 'w');
  // One promotion stands for all four: "dxe1=N, dxe1=B, dxe1=R, dxe1=Q".
  const moves = chess.moves({ verbose: true }).filter((move) => !move.promotion || move.promotion === 'q');
  // The king taking the checker takes it: 8.Qxd8+ read "the checking piece
  // cannot be taken; move the king with Kxd8".
  const kingMoves = moves.filter((move) => move.piece === 'k' && !checker.includes(move.to)).map((move) => move.san);
  const captures = moves.filter((move) => checker.includes(move.to)).map((move) => move.san);
  const blocks = moves.filter((move) => move.piece !== 'k' && !checker.includes(move.to)).map((move) => move.san);
  return [{ kind: 'checkAnswers', blocks, captures, kingMoves }];
}
