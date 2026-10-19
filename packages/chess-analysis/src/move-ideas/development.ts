import type { Color, Move, Square } from 'chess.js';
import { developedMinorPieceCount } from '../opening-development.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import { homeRank, NATURAL_KNIGHT_SQUARES, ownRank } from './squares.js';
import type { MoveIdea, Wing } from './types.js';

/** Past this move the opening's rules (move a piece once, the queen stays
 * home) no longer read as advice. */
const OPENING_LAST_MOVE = 12;
/** "White has four pieces out to Black's two": said only from a gap this size. */
const LEAD_GAP = 2;
const LEAD_LAST_MOVE = 20;

const MINOR_HOMES: Record<Color, Record<'n' | 'b', readonly Square[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'] }
};

export function developmentIdeas(context: IdeaContext): MoveIdea[] {
  return [develops(context), castles(context), clearsCastling(context), movesAgain(context), blocksPawn(context), takesKnightSquare(context), earlyQueen(context), developmentLead(context)].filter(
    (idea): idea is MoveIdea => idea !== null
  );
}

/** A knight or bishop off its first square, or the queen's first move. */
function develops({ move, previous, fullmove }: IdeaContext): MoveIdea | null {
  // A piece that takes something worth less (12…Bxh3) is doing something else than developing.
  if (move.captured && PIECE_VALUES[move.captured] < PIECE_VALUES[move.piece]) return null;
  const minorHome = (move.piece === 'n' || move.piece === 'b') && MINOR_HOMES[move.color][move.piece].includes(move.from);
  const queenFirst = move.piece === 'q' && fullmove <= OPENING_LAST_MOVE && ownRank(move.from, move.color) === 1 && !previous.some((each) => each.color === move.color && each.piece === 'q');
  if (!minorHome && !queenFirst) return null;
  return { kind: 'develops', piece: { piece: move.piece, square: move.to }, natural: move.piece === 'n' && NATURAL_KNIGHT_SQUARES.has(move.to) };
}

function castles({ move }: IdeaContext): MoveIdea | null {
  if (move.flags.includes('k')) return { kind: 'castles', wing: 'kingside', rook: move.color === 'w' ? 'f1' : 'f8' };
  if (move.flags.includes('q')) return { kind: 'castles', wing: 'queenside', rook: move.color === 'w' ? 'd1' : 'd8' };
  return null;
}

/** The move takes away the last piece between the king and a rook it can
 * still castle with. */
function clearsCastling({ move, before, after }: IdeaContext): MoveIdea | null {
  if (move.captured || move.piece === 'k' || move.flags.includes('k') || move.flags.includes('q')) return null;
  const rank = homeRank(move.color);
  const rights = after.fen().split(' ')[2] ?? '-';
  const wings: [Wing, string, readonly string[]][] = [
    ['kingside', move.color === 'w' ? 'K' : 'k', ['f', 'g']],
    ['queenside', move.color === 'w' ? 'Q' : 'q', ['b', 'c', 'd']]
  ];
  for (const [wing, right, files] of wings) {
    if (!rights.includes(right)) continue;
    const between = files.map((file) => `${file}${rank}` as Square);
    if (between.some((square) => before.get(square)) && between.every((square) => !after.get(square))) return { kind: 'clearsCastling', wing };
  }
  return null;
}

/** The same piece moved again in the opening while others wait at home,
 * and not because it was attacked: "move each piece once". */
function movesAgain({ move, previous, fullmove, before, enemy }: IdeaContext): MoveIdea | null {
  if (fullmove > OPENING_LAST_MOVE || move.piece === 'p' || move.piece === 'k' || move.captured || move.san.includes('+')) return null;
  if (before.isAttacked(move.from, enemy)) return null;
  const times = timesMoved(previous, move);
  const undeveloped = minorsAtHome(before.fen(), move.color);
  if (times < 2 || undeveloped === 0) return null;
  return { kind: 'movesAgain', piece: { piece: move.piece, square: move.to }, times, undeveloped };
}

/** How many times this piece has moved, this move included: its squares
 * are followed back through the mover's earlier moves. */
function timesMoved(previous: readonly Move[], move: Move): number {
  let square = move.from;
  let times = 1;
  for (let index = previous.length - 1; index >= 0; index--) {
    const each = previous[index];
    if (!each || each.color !== move.color || each.to !== square) continue;
    times++;
    square = each.from;
  }
  return times;
}

function minorsAtHome(fen: string, color: Color): number {
  const total = (fen.split(' ')[0] ?? '').split('').filter((char) => char === (color === 'w' ? 'N' : 'n') || char === (color === 'w' ? 'B' : 'b')).length;
  return total - developedMinorPieceCount(fen, color === 'w' ? 'white' : 'black');
}

/** A piece in front of an unmoved centre pawn: Bd3 with the pawn on d2. */
function blocksPawn({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece === 'p' || move.piece === 'k') return null;
  if (!['d', 'e'].includes(move.to[0] ?? '') || ownRank(move.to, move.color) !== 3) return null;
  const pawn = `${move.to[0]}${move.color === 'w' ? 2 : 7}` as Square;
  const piece = after.get(pawn);
  return piece?.type === 'p' && piece.color === move.color ? { kind: 'blocksPawn', piece: { piece: move.piece, square: move.to }, pawn } : null;
}

/** A pawn on c3 or f3 while the knight that belongs there is still at home. */
function takesKnightSquare({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || move.captured || !NATURAL_KNIGHT_SQUARES.has(move.to)) return null;
  const home = `${move.to[0] === 'c' ? 'b' : 'g'}${homeRank(move.color)}` as Square;
  const knight = after.get(home);
  return knight?.type === 'n' && knight.color === move.color ? { kind: 'takesKnightSquare', square: move.to } : null;
}

/** The queen two ranks out or more in the first moves, with minor pieces still at home. */
function earlyQueen({ move, before, fullmove }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'q' || move.captured || move.san.includes('+') || fullmove > 8 || ownRank(move.to, move.color) < 3) return null;
  const undeveloped = minorsAtHome(before.fen(), move.color);
  return undeveloped >= 2 ? { kind: 'earlyQueen', undeveloped } : null;
}

/** "White has four pieces out to Black's two", on a move that changed the count. */
function developmentLead({ move, after, fullmove }: IdeaContext): MoveIdea | null {
  if (fullmove > LEAD_LAST_MOVE || !(move.captured || move.piece === 'n' || move.piece === 'b' || move.flags.includes('k') || move.flags.includes('q'))) return null;
  const count = (color: Color): number => developedMinorPieceCount(after.fen(), color === 'w' ? 'white' : 'black') + (castled(after.fen(), color) ? 1 : 0);
  const white = count('w');
  const black = count('b');
  if (Math.abs(white - black) < LEAD_GAP) return null;
  return white > black ? { kind: 'developmentLead', leader: 'white', leaderCount: white, otherCount: black } : { kind: 'developmentLead', leader: 'black', leaderCount: black, otherCount: white };
}

/** The king on its castled square, with the rook beside it. */
function castled(fen: string, color: Color): boolean {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  const row = rows[color === 'w' ? 7 : 0] ?? '';
  const expanded = row.replace(/\d/g, (digit) => '.'.repeat(Number(digit)));
  const king = color === 'w' ? 'K' : 'k';
  const rook = color === 'w' ? 'R' : 'r';
  return (expanded[6] === king && expanded[5] === rook) || (expanded[2] === king && expanded[3] === rook);
}
