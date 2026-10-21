import type { Square } from 'chess.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import { looseAt, pinsOf } from './memo.js';
import { mateThreat } from './mates.js';
import { prevents } from './prevents.js';
import { attacksFrom, fileIndex, pieceAt, rankOf } from './squares.js';
import type { MoveIdea } from './types.js';


/** What the move does against the opponent's threats and plans. */
export function defenceIdeas(context: IdeaContext): MoveIdea[] {
  return [stopsMate(context), saves(context), defends(context), prevents(context), unpins(context)].filter((idea): idea is MoveIdea => idea !== null);
}

/** The opponent had a mate (in one, or two starting with a check) and no longer has it. */
function stopsMate({ fast }: IdeaContext): MoveIdea | null {
  if (!fast.enemyBefore) return null;
  const threat = mateThreat(fast.enemyBefore);
  if (!threat) return null;
  const still = mateThreat(fast.after);
  return still ? null : { kind: 'stopsMate', line: threat };
}

/** The most valuable own man the opponent could have won, that it cannot now. */
function saves(context: IdeaContext): MoveIdea | null {
  const { fenBefore, before, after, move, mover, enemy } = context;
  // Only a man under attack before the move, whose attack or defence the
  // move changed, can have been saved by it.
  const attacked = before.board().flat().flatMap((cell) => (cell && cell.color === mover && cell.type !== 'k' && before.isAttacked(cell.square, enemy) ? [cell.square] : []));
  const touched = attacked.filter((square) => square === move.from || after.attackers(square, enemy).length < before.attackers(square, enemy).length || after.attackers(square, mover).length > before.attackers(square, mover).length);
  if (touched.length === 0) return null;
  const nowSquares = touched.map((square) => (square === move.from ? move.to : square)).filter((square) => after.get(square)?.color === mover);
  const still = new Set(looseAt(after.fen(), mover, nowSquares).map((piece) => piece.square));
  const saved = looseAt(fenBefore, mover, touched)
    .filter((piece) => !still.has(piece.square === move.from ? move.to : piece.square))
    .filter((piece) => piece.square === move.from || after.get(piece.square)?.color === mover)
    .sort((a, b) => PIECE_VALUES[b.piece] - PIECE_VALUES[a.piece])[0];
  if (!saved) return null;
  const square = saved.square === move.from ? move.to : saved.square;
  return { kind: 'saves', piece: { piece: saved.piece, square }, how: howSaved(context, saved.square) };
}

/** Moved away, took the attacker, defended, or stood in the way. */
function howSaved({ before, after, move, mover }: IdeaContext, square: Square): 'moves' | 'takes' | 'defends' | 'blocks' | 'counters' {
  if (square === move.from) return 'moves';
  if (move.captured && before.attackers(square, mover === 'w' ? 'b' : 'w').includes(move.to)) return 'takes';
  if (after.attackers(square, mover).includes(move.to)) return 'defends';
  const lines = before.attackers(square, mover === 'w' ? 'b' : 'w').filter((attacker) => between(attacker, square).includes(move.to));
  return lines.length ? 'blocks' : 'counters';
}

/** The moved man becomes one more defender of an own man the opponent
 * attacks: …Bb7 behind the knight on c6. The most attacked one is named. */
function defends({ before, after, move, enemy, mover }: IdeaContext): MoveIdea | null {
  let best: { square: Square; attackers: number; defenders: number } | null = null;
  for (const square of attacksFrom(after, move.to)) {
    const piece = after.get(square);
    if (!piece || piece.color !== mover || piece.type === 'k' || square === move.to) continue;
    if (before.attackers(square, mover).includes(move.from)) continue;
    const attackers = after.attackers(square, enemy).length;
    if (attackers === 0) continue;
    const defenders = after.attackers(square, mover).length;
    if (!best || attackers > best.attackers) best = { square, attackers, defenders };
  }
  const piece = best ? pieceAt(after, best.square) : null;
  return best && piece ? { kind: 'defends', piece, attackers: best.attackers, defenders: best.defenders } : null;
}

/** An own piece that was pinned and is not after the move, because the
 * move stepped into the pin's line, moved what it was pinned to, or took
 * the pinner (…Be7 between the bishop on g5 and the queen on d8). */
function unpins({ before, after, mover, move }: IdeaContext): MoveIdea | null {
  const now = new Set(pinsOf(after.fen()).map((hit) => hit.pinned));
  const freed = pinsOf(before.fen()).find(
    (hit) =>
      before.get(hit.pinned)?.color === mover &&
      (before.get(hit.pinned)?.type !== 'p' || hit.kind === 'absolute') &&
      hit.pinned !== move.from &&
      !now.has(hit.pinned) &&
      after.get(hit.pinned)?.color === mover &&
      (move.from === hit.against || move.to === hit.by || between(hit.pinned, hit.against).includes(move.to))
  );
  const piece = freed ? pieceAt(after, freed.pinned) : null;
  return piece ? { kind: 'unpins', piece } : null;
}

/** The squares strictly between two on a rank, file or diagonal. */
function between(from: Square, to: Square): Square[] {
  const df = Math.sign(fileIndex(to) - fileIndex(from));
  const dr = Math.sign(rankOf(to) - rankOf(from));
  const files = Math.abs(fileIndex(to) - fileIndex(from));
  const ranks = Math.abs(rankOf(to) - rankOf(from));
  if (files !== 0 && ranks !== 0 && files !== ranks) return [];
  return Array.from({ length: Math.max(files, ranks) - 1 }, (_, index) => `${'abcdefgh'[fileIndex(from) + df * (index + 1)]}${rankOf(from) + dr * (index + 1)}` as Square);
}
