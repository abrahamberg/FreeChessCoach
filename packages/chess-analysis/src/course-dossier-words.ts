import { Chess, type PieceSymbol, type Square } from 'chess.js';
import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import { cpToWords, mateToWords } from './eval-words.js';
import { inspectMoves } from './inspect-moves.js';
import { PIECE_NAMES } from './piece-names.js';

const VALUABLE = new Set(['n', 'b', 'r', 'q']);

/** One engine line in words, never a number ("White is better",
 * "Black has a forced mate in 3"). Scores are White-perspective. */
export function lineWords(line: Pick<EngineLine, 'cp' | 'mateIn'>): string {
  if (line.mateIn !== null) return mateToWords(line.mateIn, 'w');
  return cpToWords(line.cp ?? 0, 'w');
}

/** The position in words: the engine's top line, or the board state when
 * the game is over (a mated or stalemated position has no engine line). */
export function positionWords(fen: string, evaluation: EngineEval | undefined): string {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return 'checkmate';
  if (chess.isStalemate()) return 'stalemate';
  const top = evaluation?.lines[0];
  return top ? lineWords(top) : 'no engine verdict';
}

/** What a move does on the board, from chess.js alone: captures, checks,
 * pieces it now attacks (and whether they are pinned to their king), what it
 * leaves hanging, forks by the moved piece. Only facts about this move: the
 * verifier lets a script say "pin" or "fork" only where these say it. */
export function boardFacts(fenBefore: string, san: string): string[] {
  const inspected = inspectMoves(fenBefore, [san]).moves[0];
  if (!inspected?.legal) return [];
  const facts: string[] = [moveWords(inspected.san, inspected.piece, inspected.from, inspected.to)];
  if (inspected.captured) facts.push(`captures the ${PIECE_NAMES[inspected.captured]} on ${inspected.to}`);
  if (inspected.gives) facts.push(`gives ${inspected.gives}`);
  if (inspected.gives === 'checkmate' && isBackRankMate(inspected.resultFen, inspected.to as Square)) facts.push('a back-rank mate');
  if (inspected.gives === 'check') facts.push(checkAnswers(inspected.resultFen));
  facts.push(...attackedPieces(inspected.resultFen, inspected.to as Square));
  for (const piece of inspected.leavesHanging) {
    if (canBeTaken(inspected.resultFen, piece.square)) facts.push(`leaves the ${PIECE_NAMES[piece.piece]} on ${piece.square} hanging`);
  }
  for (const fork of inspected.createsForks) {
    const targets = forkTargets(inspected.resultFen, fork.forkedSquares);
    if (fork.square === inspected.to && targets.length >= 2) facts.push(`the ${PIECE_NAMES[fork.piece]} on ${fork.square} forks ${targets.join(' and ')}`);
  }
  return facts;
}

/** What moved where, so a quiet move has a true fact too (gemma-4-12b
 * wrote "4.Bf4 attacks the queen" where the dossier said nothing). */
function moveWords(san: string, piece: PieceSymbol, from: string, to: string): string {
  if (san.startsWith('O-O-O')) return 'castles queenside';
  if (san.startsWith('O-O')) return 'castles kingside';
  return `moves the ${PIECE_NAMES[piece]} from ${from} to ${to}`;
}

/** Mate by a piece on the king's own back rank, checking along it. */
function isBackRankMate(fenAfter: string, checker: Square): boolean {
  const chess = new Chess(fenAfter);
  const king = chess.findPiece({ type: 'k', color: chess.turn() })[0];
  const backRank = chess.turn() === 'w' ? '1' : '8';
  return king !== undefined && king[1] === backRank && checker[1] === backRank;
}

/** How the checked side can answer, so a script can't say "forces the king
 * to move" when a block exists (gemma-4-12b did, on 4...Qb4+). */
function checkAnswers(fenAfter: string): string {
  const chess = new Chess(fenAfter);
  const checker = chess.attackers(chess.findPiece({ type: 'k', color: chess.turn() })[0] as Square, chess.turn() === 'w' ? 'b' : 'w');
  const moves = chess.moves({ verbose: true });
  const kingMoves = moves.filter((move) => move.piece === 'k').map((move) => move.san);
  const captures = moves.filter((move) => move.piece !== 'k' && checker.includes(move.to)).map((move) => move.san);
  const blocks = moves.filter((move) => move.piece !== 'k' && !checker.includes(move.to)).map((move) => move.san);
  const ways = [
    blocks.length ? `block with ${blocks.join(', ')}` : 'no block',
    captures.length ? `take the checking piece with ${captures.join(', ')}` : 'the checking piece cannot be taken',
    kingMoves.length ? `move the king with ${kingMoves.join(', ')}` : 'the king cannot move'
  ];
  return `the check can be answered: ${ways.join('; ')}`;
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

/** Why the engine's move was better, in board facts: what it does, and each
 * piece the played move left hanging that it keeps safe ("Nc3 keeps the rook
 * on a1 safe"). The model is never left to guess the reason. */
export function betterMoveFacts(fenBefore: string, playedSan: string, betterSan: string): string[] {
  const played = inspectMoves(fenBefore, [playedSan]).moves[0];
  const better = inspectMoves(fenBefore, [betterSan]).moves[0];
  if (!played?.legal || !better?.legal) return [];
  const stillHanging = new Set(better.leavesHanging.filter((piece) => canBeTaken(better.resultFen, piece.square)).map((piece) => piece.square));
  const kept = played.leavesHanging
    .filter((piece) => canBeTaken(played.resultFen, piece.square) && !stillHanging.has(piece.square))
    .map((piece) => `keeps the ${PIECE_NAMES[piece.piece]} on ${piece.square} safe${newDefenders(played.resultFen, better.resultFen, piece.square as Square)}`);
  return [...boardFacts(fenBefore, betterSan), ...kept];
}

/** ": the queen on d1 now defends it" — how the better move keeps it safe,
 * so the model doesn't guess ("Nc3 blocks the queen's attack", it doesn't). */
function newDefenders(playedFen: string, betterFen: string, square: Square): string {
  const played = new Chess(playedFen);
  const better = new Chess(betterFen);
  const owner = better.get(square)?.color;
  if (!owner) return '';
  const before = new Set(played.attackers(square, owner));
  const added = better.attackers(square, owner).filter((from) => !before.has(from));
  const names = added.map((from) => `the ${PIECE_NAMES[better.get(from)!.type]} on ${from}`);
  return names.length ? `: ${names.join(' and ')} now ${names.length > 1 ? 'defend' : 'defends'} it` : '';
}

/** The moved piece used to guard the square the opponent's best reply lands
 * on ("the queen stops guarding c1, where Qc1# follows"): why a move loses,
 * stated rather than guessed. */
export function abandonedGuard(fenBefore: string, san: string, replySan: string | undefined): string[] {
  const moved = inspectMoves(fenBefore, [san]).moves[0];
  if (!moved?.legal || !replySan) return [];
  const reply = inspectMoves(moved.resultFen, [replySan]).moves[0];
  if (!reply?.legal || !(reply.captured || reply.gives)) return [];
  const target = reply.to as Square;
  const color = moved.color === 'white' ? 'w' : 'b';
  const guardedBefore = new Chess(fenBefore).attackers(target, color).includes(moved.from as Square);
  const guardsAfter = new Chess(moved.resultFen).attackers(target, color).includes(moved.to as Square);
  return guardedBefore && !guardsAfter ? [`the ${PIECE_NAMES[moved.piece]} stops guarding ${target}, where ${replySan} follows`] : [];
}

/** A legal capture on the square, so a pinned attacker doesn't count. */
function canBeTaken(fenAfter: string, square: string): boolean {
  return new Chess(fenAfter).moves({ verbose: true }).some((move) => move.to === square && Boolean(move.captured));
}

/** Enemy knights, bishops, rooks and queens the moved piece now hits. */
function attackedPieces(fenAfter: string, from: Square): string[] {
  const chess = new Chess(fenAfter);
  const mover = chess.get(from);
  if (!mover) return [];
  const targets: string[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color === mover.color || !VALUABLE.has(cell.type)) continue;
      if (!chess.attackers(cell.square, mover.color).includes(from)) continue;
      const target = `the ${PIECE_NAMES[cell.type]} on ${cell.square}`;
      targets.push(isPinnedToKing(fenAfter, cell.square, from) ? `attacks ${target}, which is pinned to the king` : `attacks ${target}`);
    }
  }
  return targets;
}

/** Lifting the piece off the board would put its own king in check from `pinner`. */
function isPinnedToKing(fenAfter: string, square: Square, pinner: Square): boolean {
  const chess = new Chess(fenAfter);
  const piece = chess.get(square);
  if (!piece) return false;
  const king = chess.findPiece({ type: 'k', color: piece.color })[0];
  if (king === undefined) return false;
  const enemy = piece.color === 'w' ? 'b' : 'w';
  // Already giving check: the piece is not what shields the king.
  if (chess.attackers(king, enemy).includes(pinner)) return false;
  chess.remove(square);
  return chess.attackers(king, enemy).includes(pinner);
}
