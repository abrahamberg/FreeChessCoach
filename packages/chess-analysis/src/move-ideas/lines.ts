import type { Chess, Color, Square } from 'chess.js';
import { lineChanges, rooksConnected } from '../piece-coordination.js';
import type { IdeaContext } from './context.js';
import { fileIndex, kingZone, ownRank, pieceAt, rankOf, squareAt } from './squares.js';
import type { MoveIdea } from './types.js';

const DIAGONALS: readonly [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const FIANCHETTO = new Set(['b2', 'g2', 'b7', 'g7']);
const LONG_DIAGONALS = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8', 'h1', 'g2', 'f3', 'e4', 'd5', 'c6', 'b7', 'a8']);

export function lineIdeas(context: IdeaContext): MoveIdea[] {
  return [...openings(context), longDiagonal(context), aimsAt(context), battery(context), rookFile(context), rookToCentre(context), connectsRooks(context), opensFile(context), doubles(context), seventh(context)].filter(
    (idea): idea is MoveIdea => idea !== null
  );
}

/** Own sliders the move opens or shuts in, and enemy ones it opens (from
 * `lineChanges`, the review's own measure). Out of check every piece
 * "gains" squares: nothing is said then. */
function openings({ fenBefore, move, before, fullmove }: IdeaContext): MoveIdea[] {
  if (before.inCheck()) return [];
  const ideas: MoveIdea[] = [];
  // In the first moves a queen or bishop let out by two squares is the
  // point of the pawn move (…d5 "gives the queen more scope").
  const early = fullmove <= 10 && move.piece === 'p' ? { minReach: 2, minChange: 2 } : undefined;
  const [opened] = lineChanges(fenBefore, move, 'opens', 'own', early).filter((each) => !early || each.piece !== 'r');
  if (opened) ideas.push({ kind: 'opensLine', piece: { piece: opened.piece, square: opened.square }, before: opened.before, after: opened.after });
  const [shut] = move.captured ? [] : lineChanges(fenBefore, move, 'closes');
  if (shut) ideas.push({ kind: 'shutsIn', piece: { piece: shut.piece, square: shut.square }, before: shut.before, after: shut.after });
  const [enemy] = lineChanges(fenBefore, move, 'opens', 'enemy');
  if (enemy) ideas.push({ kind: 'opensEnemyLine', piece: { piece: enemy.piece, square: enemy.square }, before: enemy.before, after: enemy.after });
  return ideas;
}

/** A bishop that takes one of the two long diagonals with room to work on it. */
function longDiagonal({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'b' || !LONG_DIAGONALS.has(move.to)) return null;
  if (FIANCHETTO.has(move.to) && ownRank(move.to, move.color) === 2) return { kind: 'fianchetto', piece: { piece: 'b', square: move.to } };
  const reach = DIAGONALS.reduce((sum, direction) => sum + ray(after, move.to, direction).empty.length, 0);
  return reach >= 4 ? { kind: 'longDiagonal', piece: { piece: 'b', square: move.to } } : null;
}

/** A bishop or queen whose diagonal leads into the enemy king's corner:
 * straight at the king through one piece, or at a pawn beside it that only
 * the king defends (3.Bc4 at f7). */
function aimsAt({ move, after, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'b' && move.piece !== 'q') return null;
  const zone = new Set(kingZone(after, enemy));
  for (const direction of DIAGONALS) {
    const { hits } = ray(after, move.to, direction);
    const [first, second] = hits;
    if (!first) continue;
    const firstPiece = after.get(first);
    if (firstPiece?.type === 'k') continue;
    const piece = { piece: move.piece, square: move.to };
    if (second && after.get(second)?.type === 'k' && after.get(second)?.color === enemy) return { kind: 'aimsAt', piece, target: { piece: 'k', square: second }, through: pieceAt(after, first), onlyKingDefends: false };
    if (firstPiece?.color === enemy && firstPiece.type === 'p' && zone.has(first) && onlyKingDefends(after, first, enemy)) return { kind: 'aimsAt', piece, target: { piece: 'p', square: first }, through: null, onlyKingDefends: true };
    const target = shieldPawn(after, enemy, first, second);
    if (target && move.piece === 'b') return { kind: 'aimsAt', piece, target: { piece: 'p', square: target.square }, through: target.through ? pieceAt(after, target.through) : null, onlyKingDefends: false };
  }
  return null;
}

/** A pawn on the enemy's second rank on the h- or f-file, met directly or
 * behind one man: the h7 a bishop on d3 eyes before Black has even
 * castled. */
function shieldPawn(board: Chess, enemy: Color, first: Square, second: Square | undefined): { square: Square; through: Square | null } | null {
  const isTarget = (square: Square | undefined): boolean => {
    const piece = square ? board.get(square) : undefined;
    return piece?.type === 'p' && piece.color === enemy && square !== undefined && ownRank(square, enemy) === 2 && ['h', 'f'].includes(square[0] ?? '');
  };
  if (isTarget(first)) return { square: first, through: null };
  if (second && isTarget(second)) return { square: second, through: first };
  return null;
}

/** Queen and bishop on one diagonal, nothing between, aimed into the enemy
 * king's corner: the battery against h7. */
function battery({ move, after, enemy }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'q' && move.piece !== 'b') return null;
  const partner = move.piece === 'q' ? 'b' : 'q';
  const zone = new Set(kingZone(after, enemy));
  for (const direction of DIAGONALS) {
    const [first, second] = ray(after, move.to, direction).hits;
    const near = first ? after.get(first) : undefined;
    if (!first || near?.type !== partner || near.color !== move.color) continue;
    const back = pieceAt(after, move.to);
    const front = pieceAt(after, first);
    const reach = [...ray(after, first, direction).empty, ...(second ? [second] : [])];
    const target = reach.find((square) => zone.has(square) || (after.get(square)?.color === enemy && after.get(square)?.type === 'p' && ownRank(square, enemy) === 2));
    if (back && front && target) return { kind: 'battery', front, back, target };
  }
  return null;
}

function onlyKingDefends(board: Chess, square: Square, owner: Color): boolean {
  const defenders = board.attackers(square, owner);
  return defenders.length === 1 && board.get(defenders[0] as Square)?.type === 'k';
}

/** The empty squares along a direction and the first two pieces met. */
function ray(board: Chess, from: Square, [df, dr]: readonly [number, number]): { empty: Square[]; hits: Square[] } {
  const empty: Square[] = [];
  const hits: Square[] = [];
  for (let step = 1; step < 8 && hits.length < 2; step++) {
    const square = squareAt(fileIndex(from) + df * step, rankOf(from) + dr * step);
    if (!square) break;
    if (board.get(square)) hits.push(square);
    else if (hits.length === 0) empty.push(square);
  }
  return { empty, hits };
}

/** A rook onto a file with none of its own pawns: open or half-open. */
function rookFile({ move, after }: IdeaContext): MoveIdea | null {
  const rookTo = move.flags.includes('k') ? (move.color === 'w' ? 'f1' : 'f8') : move.flags.includes('q') ? (move.color === 'w' ? 'd1' : 'd8') : move.piece === 'r' && !move.captured && move.from[0] !== move.to[0] ? move.to : null;
  if (!rookTo) return null;
  const file = rookTo[0] ?? 'a';
  const pawns = after.board().flat().filter((cell) => cell?.type === 'p' && cell.square[0] === file);
  if (pawns.some((pawn) => pawn?.color === move.color)) return null;
  return { kind: 'rookFile', file, open: pawns.length === 0 };
}

/** A rook to the d- or e-file, where files open first, when the file is
 * not already open to it (`rookFile` says that). */
function rookToCentre({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'r' || move.captured || move.from[0] === move.to[0] || !['d', 'e'].includes(move.to[0] ?? '')) return null;
  const ownPawn = after.board().flat().some((cell) => cell?.type === 'p' && cell.color === move.color && cell.square[0] === move.to[0]);
  return ownPawn ? { kind: 'rookToCentre', file: move.to[0] ?? 'd' } : null;
}

function connectsRooks({ fenBefore, move }: IdeaContext): MoveIdea | null {
  if (move.captured || move.piece === 'r') return null;
  return !rooksConnected(fenBefore, move.color) && rooksConnected(move.after, move.color) ? { kind: 'connectsRooks' } : null;
}

/** A pawn that leaves its file (by taking) and opens it for the own rooks:
 * 11.bxc3 and the b-file. */
function opensFile({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'p' || !move.captured) return null;
  const file = move.from[0] ?? 'a';
  const pawns = after.board().flat().filter((cell) => cell?.type === 'p' && cell.square[0] === file);
  if (pawns.some((pawn) => pawn?.color === move.color)) return null;
  const heavy = after.board().flat().some((cell) => cell && cell.color === move.color && (cell.type === 'r' || cell.type === 'q'));
  return heavy ? { kind: 'opensFile', file, open: pawns.length === 0 } : null;
}

/** Two heavy pieces on one file with nothing between them. */
function doubles({ move, after }: IdeaContext): MoveIdea | null {
  if (move.piece !== 'r' && move.piece !== 'q') return null;
  const file = move.to[0] ?? 'a';
  for (const direction of [1, -1]) {
    for (let rank = rankOf(move.to) + direction; rank >= 1 && rank <= 8; rank += direction) {
      const piece = after.get(`${file}${rank}` as Square);
      if (!piece) continue;
      if (piece.color === move.color && (piece.type === 'r' || piece.type === 'q') && (piece.type === 'r' || move.piece === 'r')) {
        return { kind: 'doubles', pieces: [{ piece: move.piece, square: move.to }, { piece: piece.type, square: `${file}${rank}` as Square }], line: `${file}-file` };
      }
      break;
    }
  }
  return null;
}

function seventh({ move }: IdeaContext): MoveIdea | null {
  return move.piece === 'r' && ownRank(move.to, move.color) === 7 ? { kind: 'seventhRank', piece: { piece: 'r', square: move.to } } : null;
}
