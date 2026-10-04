import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { flipActiveColorFen } from './null-move-fen.js';
import { PIECE_NAMES } from './piece-names.js';
import { PIECE_VALUES } from './tactics.js';

/** A bishop, rook or queen that had at least this many squares to go to. */
const MIN_REACH = 5;
/** The squares one move takes away from (or gives to) such a piece. */
const MIN_CHANGE = 3;

const SLIDERS: readonly PieceSymbol[] = ['b', 'r', 'q'];

interface Reach {
  piece: PieceSymbol;
  squares: Set<Square>;
}

/** Where each of `color`'s bishops, rooks and queens can go in `fen`. The
 * side to move is flipped when it is not `color`; null when that is not
 * possible (a check on the board). */
function sliderReach(fen: string, color: Color): Map<Square, Reach> | null {
  const turn = fen.split(' ')[1];
  const asked = turn === color ? fen : flipActiveColorFen(fen);
  if (!asked) return null;
  const chess = new Chess(asked);
  const reach = new Map<Square, Reach>();
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== color || !SLIDERS.includes(piece.type)) continue;
      const squares = new Set(chess.moves({ square: piece.square, verbose: true }).map((each) => each.to as Square));
      reach.set(piece.square, { piece: piece.type, squares });
    }
  }
  return reach;
}

export interface LineChange {
  piece: PieceSymbol;
  square: Square;
  before: number;
  after: number;
}

/** The own slider whose reach `move` changes the most, in the direction
 * asked (`'closes'`: loses squares, `'opens'`: gains them). The moved piece
 * itself is not counted, and a slider that was captured is gone. */
export function lineChange(fenBefore: string, move: Move, direction: 'closes' | 'opens'): LineChange | null {
  const before = sliderReach(fenBefore, move.color);
  const after = sliderReach(move.after, move.color);
  if (!before || !after) return null;
  let found: LineChange | null = null;
  let biggest = 0;
  for (const [square, was] of before) {
    const now = after.get(square);
    if (square === move.from || !now) continue;
    const change = direction === 'closes' ? was.squares.size - now.squares.size : now.squares.size - was.squares.size;
    const kept = direction === 'closes' ? was.squares.size : now.squares.size;
    if (kept < MIN_REACH || change < MIN_CHANGE || change <= biggest) continue;
    biggest = change;
    found = { piece: was.piece, square, before: was.squares.size, after: now.squares.size };
  }
  return found;
}

const squares = (count: number): string => `${count} square${count === 1 ? '' : 's'}`;

function sliderName(change: LineChange): string {
  return `${PIECE_NAMES[change.piece]} on ${change.square}`;
}

/** Why a costly move was worse than the engine's: it shut in a piece of its
 * own that the engine's move left free. "f4 cuts off the bishop on d6 (from
 * 9 squares to 3); g5 keeps it open". */
export function blocksOwnPieceText(fenBefore: string, played: Move, best: Move): string | null {
  if (played.captured || played.san.endsWith('+')) return null;
  const closed = lineChange(fenBefore, played, 'closes');
  if (!closed) return null;
  const alsoClosed = lineChange(fenBefore, best, 'closes');
  if (alsoClosed?.square === closed.square) return null;
  return `${played.san} cuts off the ${sliderName(closed)}, from ${squares(closed.before)} to ${closed.after}; ${best.san} keeps it open`;
}

/** What a good move did for the pieces behind it: "opens the bishop on c1 (from 2 squares to 8)". */
export function opensOwnPieceText(fenBefore: string, played: Move): string | null {
  if (played.captured || played.san.endsWith('+') || played.piece !== 'p') return null;
  const opened = lineChange(fenBefore, played, 'opens');
  return opened ? `Opens the ${sliderName(opened)}, from ${squares(opened.before)} to ${opened.after}` : null;
}

const ORDINALS = ['', '', 'second', 'third', 'fourth', 'fifth'];

/** A move that adds an attacker to an enemy piece the opponent defends, and
 * leaves it attacked more often than defended: "adds a third attacker to the
 * knight on d5, which has one defender". A piece nothing defends is a plain
 * capture threat for the tactics to name. */
export function pilesOnText(fenBefore: string, move: Move): string | null {
  if (move.san.endsWith('+') || move.piece === 'k') return null;
  const enemy = move.color === 'w' ? 'b' : 'w';
  const before = new Chess(fenBefore);
  const after = new Chess(move.after);
  let best: { square: Square; type: PieceSymbol; attackers: number; defenders: number } | null = null;
  for (const row of after.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== enemy || piece.type === 'k') continue;
      const attackers = after.attackers(piece.square, move.color);
      const defenders = after.attackers(piece.square, enemy).length;
      if (!attackers.includes(move.to as Square) || attackers.length < 2 || defenders === 0 || attackers.length <= defenders) continue;
      // Winning the exchange needs an attacker no dearer than the target.
      const cheapest = Math.min(...attackers.map((square) => PIECE_VALUES[after.get(square)!.type]));
      if (cheapest > PIECE_VALUES[piece.type]) continue;
      if (before.attackers(piece.square, move.color).length >= attackers.length) continue;
      const better = !best || PIECE_VALUE_ORDER.indexOf(piece.type) > PIECE_VALUE_ORDER.indexOf(best.type);
      if (better) best = { square: piece.square, type: piece.type, attackers: attackers.length, defenders };
    }
  }
  if (!best) return null;
  const ordinal = ORDINALS[best.attackers] ?? `${best.attackers}th`;
  return `adds a ${ordinal} attacker to the ${PIECE_NAMES[best.type]} on ${best.square}, which has ${best.defenders === 1 ? 'one defender' : `${best.defenders} defenders`}`;
}

const PIECE_VALUE_ORDER: readonly PieceSymbol[] = ['p', 'n', 'b', 'r', 'q'];
