import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { inspectMoves } from '../inspect-moves.js';
import { PIECE_NAMES } from '../piece-names.js';
import { blockedCheck, checkAnswers, discovered, isBackRankMate, mateNet } from './check-facts.js';
import { endgameGeometry } from './endgame-geometry.js';
import { attackedPieces, canBeTaken, valueOf } from './safety.js';

/** What a move does on the board, from chess.js alone: captures, checks,
 * pieces it now attacks (and whether they are pinned to their king), what it
 * leaves hanging, forks by the moved piece. Only facts about this move: the
 * verifier lets a script say "pin" or "fork" only where these say it. */
export function boardFacts(fenBefore: string, san: string): string[] {
  const inspected = inspectMoves(fenBefore, [san]).moves[0];
  if (!inspected?.legal) return [];
  const facts: string[] = [moveWords(inspected.san, inspected.piece, inspected.from, inspected.to)];
  const promoted = /=([QRBN])/.exec(inspected.san)?.[1];
  if (promoted) facts.push(`promotes to a ${PIECE_NAMES[promoted.toLowerCase() as PieceSymbol]}`);
  // En passant takes the pawn beside the capturer, not on the square it
  // lands on: 1.fxg6# read "captures the pawn on g6" for the pawn on g5.
  const enPassant = inspected.captured !== null && new Chess(fenBefore).move(inspected.san).isEnPassant();
  if (enPassant) facts.push(`captures the pawn on ${inspected.to[0]}${inspected.from[1]} en passant`);
  else if (inspected.captured) facts.push(`captures the ${PIECE_NAMES[inspected.captured]} on ${inspected.to}`);
  facts.push(...blockedCheck(fenBefore, inspected.piece, inspected.to), ...endgameGeometry(inspected.resultFen, inspected.piece, inspected.to as Square));
  if (inspected.gives) facts.push(`gives ${inspected.gives}`, ...discovered(inspected.resultFen, inspected.to as Square));
  if (inspected.gives === 'checkmate' && isBackRankMate(inspected.resultFen, inspected.to as Square)) facts.push('a back-rank mate');
  if (inspected.gives === 'checkmate') facts.push(mateNet(inspected.resultFen));
  if (inspected.gives === 'check') facts.push(checkAnswers(inspected.resultFen));
  // A mate ends the game: what else the piece hits is noise ("Nd6# forks the
  // bishop on c8").
  if (inspected.gives !== 'checkmate') facts.push(...attackedPieces(inspected.resultFen, inspected.to as Square));
  // A capture taken back is a trade, not a piece left hanging: 3…cxd4 read
  // "leaves the pawn on d4 hanging" in every Open Sicilian.
  const traded = (square: string): boolean => square === inspected.to && inspected.captured !== null && valueOf(inspected.captured) >= valueOf(inspected.piece);
  const owner = new Chess(fenBefore).turn() === 'w' ? 'white' : 'black';
  for (const piece of inspected.leavesHanging) {
    // Whose piece: the model read "exd5 leaves the pawn on g4 hanging" as
    // the learner's pawn, and it was White's.
    if (!traded(piece.square) && canBeTaken(inspected.resultFen, piece.square)) facts.push(`leaves the ${owner} ${PIECE_NAMES[piece.piece]} on ${piece.square} hanging${takingStalemates(inspected.resultFen, piece.square) ? ': taking it is stalemate' : ''}`);
  }
  // A piece that is simply taken forks nothing: 3.Qg8+ in Philidor's Legacy
  // read "forks the rook on a8 and the king on h8" before …Rxg8.
  const forker = inspected.gives !== 'checkmate' && !canBeTaken(inspected.resultFen, inspected.to);
  for (const fork of inspected.createsForks) {
    const targets = forkTargets(inspected.resultFen, fork.forkedSquares);
    if (forker && fork.square === inspected.to && targets.length >= 2) facts.push(`the ${PIECE_NAMES[fork.piece]} on ${fork.square} forks ${targets.join(' and ')}`);
  }
  return facts;
}

/** A capture of the piece on `square` leaves the capturer's opponent no
 * legal move: the desperado rook of a stalemate save (…Rg2+ Kxg2). */
function takingStalemates(fen: string, square: string): boolean {
  const chess = new Chess(fen);
  return chess.moves({ verbose: true }).some((move) => {
    if (move.to !== square || !move.captured) return false;
    chess.move(move);
    const stalemate = chess.isStalemate();
    chess.undo();
    return stalemate;
  });
}

/** What moved where, so a quiet move has a true fact too (gemma-4-12b
 * wrote "4.Bf4 attacks the queen" where the dossier said nothing). */
function moveWords(san: string, piece: PieceSymbol, from: string, to: string): string {
  if (san.startsWith('O-O-O')) return 'castles queenside';
  if (san.startsWith('O-O')) return 'castles kingside';
  return `moves the ${PIECE_NAMES[piece]} from ${from} to ${to}`;
}

/** The forked pieces by name, pawns left out: "forks e5 and a2 and c2" read
 * as nonsense and was copied word for word. */
function forkTargets(fenAfter: string, squares: string[]): string[] {
  const chess = new Chess(fenAfter);
  return squares.flatMap((square) => {
    const piece = chess.get(square as Square);
    return piece && piece.type !== 'p' ? [`the ${PIECE_NAMES[piece.type]} on ${square}`] : [];
  });
}
