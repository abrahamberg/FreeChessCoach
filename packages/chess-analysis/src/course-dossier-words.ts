import { Chess, type Square } from 'chess.js';
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
 * pieces it now attacks, what it leaves hanging, forks it creates. */
export function boardFacts(fenBefore: string, san: string): string[] {
  const inspected = inspectMoves(fenBefore, [san]).moves[0];
  if (!inspected?.legal) return [];
  const facts: string[] = [];
  if (inspected.captured) facts.push(`captures the ${PIECE_NAMES[inspected.captured]} on ${inspected.to}`);
  if (inspected.gives) facts.push(`gives ${inspected.gives}`);
  facts.push(...attackedPieces(inspected.resultFen, inspected.to as Square).map((target) => `attacks the ${target}`));
  for (const piece of inspected.leavesHanging) facts.push(`leaves the ${PIECE_NAMES[piece.piece]} on ${piece.square} hanging`);
  for (const fork of inspected.createsForks) {
    facts.push(`the ${PIECE_NAMES[fork.piece]} on ${fork.square} forks ${fork.forkedSquares.join(' and ')}`);
  }
  return facts;
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
      if (chess.attackers(cell.square, mover.color).includes(from)) targets.push(`${PIECE_NAMES[cell.type]} on ${cell.square}`);
    }
  }
  return targets;
}
