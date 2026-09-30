import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { inspectMoves } from '../inspect-moves.js';
import { blockedCheck, checkAnswers, discovered, isBackRankMate, mateNet } from './check-facts.js';
import { endgameGeometry } from './endgame-geometry.js';
import { attackedPieces, canBeTaken } from './safety.js';
import { pieceValueOrKing } from '../tactics.js';
import type { BoardFact, PieceAt } from './types.js';

/** What a move does on the board, from chess.js alone: captures, checks,
 * pieces it now attacks (and whether they are pinned to their king), what it
 * leaves hanging, forks by the moved piece. Only facts about this move: the
 * verifier lets a script say "pin" or "fork" only where these say it. */
export function boardFacts(fenBefore: string, san: string): BoardFact[] {
  const inspected = inspectMoves(fenBefore, [san]).moves[0];
  if (!inspected?.legal) return [];
  const to = inspected.to as Square;
  const facts: BoardFact[] = [moved(inspected.san, inspected.piece, inspected.from as Square, to)];
  const promoted = /=([QRBN])/.exec(inspected.san)?.[1];
  if (promoted) facts.push({ kind: 'promotes', piece: promoted.toLowerCase() as PieceSymbol });
  // En passant takes the pawn beside the capturer, not on the square it
  // lands on: 1.fxg6# read "captures the pawn on g6" for the pawn on g5.
  const enPassant = inspected.captured !== null && new Chess(fenBefore).move(inspected.san).isEnPassant();
  if (enPassant) facts.push({ kind: 'captures', piece: 'p', square: `${inspected.to[0]}${inspected.from[1]}` as Square, enPassant: true });
  else if (inspected.captured) facts.push({ kind: 'captures', piece: inspected.captured, square: to, enPassant: false });
  facts.push(...blockedCheck(fenBefore, inspected.piece, inspected.to), ...endgameGeometry(inspected.resultFen, inspected.piece, to));
  if (inspected.gives) facts.push({ kind: 'gives', check: inspected.gives }, ...discovered(inspected.resultFen, to));
  if (inspected.gives === 'checkmate' && isBackRankMate(inspected.resultFen, to)) facts.push({ kind: 'backRankMate' });
  if (inspected.gives === 'checkmate') facts.push(...mateNet(inspected.resultFen));
  if (inspected.gives === 'check') facts.push(...checkAnswers(inspected.resultFen));
  // A mate ends the game: what else the piece hits is noise ("Nd6# forks the
  // bishop on c8").
  if (inspected.gives !== 'checkmate') facts.push(...attackedPieces(inspected.resultFen, to));
  // A capture taken back is a trade, not a piece left hanging: 3…cxd4 read
  // "leaves the pawn on d4 hanging" in every Open Sicilian.
  const traded = (square: string): boolean => square === inspected.to && inspected.captured !== null && pieceValueOrKing(inspected.captured) >= pieceValueOrKing(inspected.piece);
  const owner = new Chess(fenBefore).turn() === 'w' ? 'white' : 'black';
  for (const piece of inspected.leavesHanging) {
    // Whose piece: the model read "exd5 leaves the pawn on g4 hanging" as
    // the learner's pawn, and it was White's.
    if (!traded(piece.square) && canBeTaken(inspected.resultFen, piece.square)) {
      facts.push({ kind: 'leavesHanging', piece: { piece: piece.piece, square: piece.square as Square }, owner, stalemateIfTaken: takingStalemates(inspected.resultFen, piece.square) });
    }
  }
  // A piece that is simply taken forks nothing: 3.Qg8+ in Philidor's Legacy
  // read "forks the rook on a8 and the king on h8" before …Rxg8.
  const forker = inspected.gives !== 'checkmate' && !canBeTaken(inspected.resultFen, inspected.to);
  for (const fork of inspected.createsForks) {
    const targets = forkTargets(inspected.resultFen, fork.forkedSquares);
    if (forker && fork.square === inspected.to && targets.length >= 2) facts.push({ kind: 'forks', piece: { piece: fork.piece, square: fork.square as Square }, targets });
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
function moved(san: string, piece: PieceSymbol, from: Square, to: Square): BoardFact {
  if (san.startsWith('O-O-O')) return { kind: 'castles', wing: 'queenside' };
  if (san.startsWith('O-O')) return { kind: 'castles', wing: 'kingside' };
  return { kind: 'moved', piece, from, to };
}

/** The forked pieces by name, pawns left out: "forks e5 and a2 and c2" read
 * as nonsense and was copied word for word. */
function forkTargets(fenAfter: string, squares: string[]): PieceAt[] {
  const chess = new Chess(fenAfter);
  return squares.flatMap((square) => {
    const piece = chess.get(square as Square);
    return piece && piece.type !== 'p' ? [{ piece: piece.type, square: square as Square }] : [];
  });
}
