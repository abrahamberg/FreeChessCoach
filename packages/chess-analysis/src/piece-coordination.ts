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
export function lineChange(fenBefore: string, move: Move, direction: 'closes' | 'opens', side: 'own' | 'enemy' = 'own'): LineChange | null {
  const color = side === 'own' ? move.color : move.color === 'w' ? 'b' : 'w';
  const before = sliderReach(fenBefore, color);
  const after = sliderReach(move.after, color);
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
  if (played.captured || played.san.endsWith('+') || played.piece !== 'p' || played.from[1] === (played.color === 'w' ? '2' : '7')) return null;
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

/** Whether `color`'s two rooks see each other along a rank or file. */
function rooksConnected(fen: string, color: Color): boolean {
  const chess = new Chess(fen);
  const rooks = chess.findPiece({ type: 'r', color });
  const [first, second] = rooks;
  return rooks.length === 2 && first !== undefined && second !== undefined && chess.attackers(first, color).includes(second);
}

/** "connects the rooks": the move clears the last piece between them. */
export function connectsRooksText(fenBefore: string, move: Move): string | null {
  if (move.captured || move.san.endsWith('+') || move.piece === 'r' || move.piece === 'k') return null;
  return !rooksConnected(fenBefore, move.color) && rooksConnected(move.after, move.color) ? 'connects the rooks' : null;
}

/** "supports the knight on e5 with the pawn": a pawn move that defends an
 * advanced minor piece of its own that no pawn defended. */
export function supportsAdvancedPieceText(fenBefore: string, move: Move): string | null {
  if (move.piece !== 'p' || move.captured || move.san.endsWith('+')) return null;
  const before = new Chess(fenBefore);
  const after = new Chess(move.after);
  const rankOf = (square: Square): number => (move.color === 'w' ? Number(square[1]) : 9 - Number(square[1]));
  const pawnDefends = (chess: Chess, square: Square): boolean => chess.attackers(square, move.color).some((from) => chess.get(from)?.type === 'p');
  for (const row of after.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== move.color || (piece.type !== 'n' && piece.type !== 'b') || rankOf(piece.square) < 4) continue;
      if (pawnDefends(after, piece.square) && !pawnDefends(before, piece.square)) return `supports the ${PIECE_NAMES[piece.type]} on ${piece.square} with the pawn`;
    }
  }
  return null;
}

/** What the engine's move did for the pieces, for "X was better: it …". */
export function coordinationFragment(fenBefore: string, move: Move): string | null {
  return pilesOnText(fenBefore, move) ?? connectsRooksText(fenBefore, move) ?? supportsAdvancedPieceText(fenBefore, move);
}

/** A move that frees one of the opponent's long-range pieces: "exf4 frees
 * Black's bishop on d6, from 6 squares to 9: Bxf4 attacks the knight on d2".
 * Either the move itself opens the piece's lines, or one of the engine's replies is
 * that piece taking back on the same square (the pawn it took was shutting
 * the piece in) and landing on a much longer line. The reply is named only
 * when the freed piece makes it and it hits something. */
export function freesEnemyPieceText(fenBefore: string, move: Move, replies: readonly string[], threatAfter: (fen: string, san: string) => string | null): string | null {
  if (move.san.endsWith('+') || move.piece === 'k') return null;
  const owner = move.color === 'w' ? 'Black' : 'White';
  const replyMoves = replies.flatMap((reply) => safeMove(move.after, reply) ?? []);
  const freed = lineChange(fenBefore, move, 'opens', 'enemy');
  if (freed) {
    const base = `${move.san} frees ${owner}'s ${sliderName(freed)}, from ${squares(freed.before)} to ${freed.after}`;
    const reply = replyMoves.find((each) => each.from === freed.square && threatAfter(move.after, each.san));
    return reply ? `${base}: ${reply.san} ${threatAfter(move.after, reply.san)}` : base;
  }
  return replyMoves.map((reply) => recaptureFrees(fenBefore, move, reply, owner, threatAfter)).find((text) => text !== null) ?? null;
}

/** The pawn taken was the piece's own blocker: the piece takes back, lands on
 * a longer line (two squares or more) and attacks something from there. */
function recaptureFrees(fenBefore: string, move: Move, reply: Move | null, owner: string, threatAfter: (fen: string, san: string) => string | null): string | null {
  if (move.captured !== 'p' || !reply?.captured || reply.to !== move.to || !SLIDERS.includes(reply.piece)) return null;
  const enemy = move.color === 'w' ? 'b' : 'w';
  const was = sliderReach(fenBefore, enemy)?.get(reply.from as Square);
  const now = sliderReach(reply.after, enemy)?.get(reply.to as Square);
  const threat = threatAfter(move.after, reply.san);
  if (!threat || !was || !now || now.squares.size < MIN_REACH || now.squares.size - was.squares.size < 2) return null;
  return `${move.san} takes the pawn that shut in ${owner}'s ${PIECE_NAMES[reply.piece]} on ${reply.from}: ${reply.san} frees it, from ${squares(was.squares.size)} to ${now.squares.size}, and ${threat}`;
}

function safeMove(fen: string, san: string): Move | null {
  try {
    return new Chess(fen).move(san);
  } catch {
    return null;
  }
}

const CHECK_MIN = 3;
const CHECK_GAP = 2;

/** How many checks the side to move in `fen` has available. */
function checksAvailable(fen: string): number {
  return new Chess(fen).moves().filter((san) => san.endsWith('+') || san.endsWith('#')).length;
}

/** A move that leaves the mover's king open to more checks than the engine's
 * move does: "Kxd8 leaves your king facing 4 possible checks; Qxd8 allows
 * only 2". Counted on the board after each move, with the opponent to move. */
export function allowsChecksText(played: Move, best: Move): string | null {
  if (played.san.endsWith('+') || best.san.endsWith('+')) return null;
  const allowed = checksAvailable(played.after);
  const bestAllowed = checksAvailable(best.after);
  if (allowed < CHECK_MIN || allowed - bestAllowed < CHECK_GAP) return null;
  return `${played.san} leaves the king facing ${allowed} possible checks; ${best.san} allows ${bestAllowed === 0 ? 'none' : `only ${bestAllowed}`}`;
}

/** Past this move the centre is no longer what the pawns are for. */
const CENTRE_LAST_MOVE = 20;

const CENTRE: readonly Square[] = ['d4', 'e4', 'd5', 'e5'];

function pawnHold(fen: string, color: Color, square: Square): number {
  const chess = new Chess(fen);
  return chess.attackers(square, color).filter((from) => chess.get(from)?.type === 'p').length;
}

/** A pawn move that gives up a pawn's hold on a centre square the engine's
 * move keeps: "f4 gives up a pawn's hold on e4 (2 pawns guard it, 1 after);
 * g5 keeps it". */
export function givesUpCentreText(fenBefore: string, played: Move, best: Move): string | null {
  if (played.piece !== 'p' || played.captured || best.captured || best.piece === 'k' || Number(fenBefore.split(' ')[5]) > CENTRE_LAST_MOVE) return null;
  let worst: { square: Square; before: number; after: number } | null = null;
  for (const square of CENTRE) {
    const before = pawnHold(fenBefore, played.color, square);
    const after = pawnHold(played.after, played.color, square);
    if (after >= before || pawnHold(best.after, best.color, square) < before) continue;
    if (!worst || before - after > worst.before - worst.after) worst = { square, before, after };
  }
  if (!worst) return null;
  return `${played.san} gives up a pawn's hold on ${worst.square} (${worst.before} ${worst.before === 1 ? 'pawn guards' : 'pawns guard'} it, ${worst.after} after); ${best.san} keeps it`;
}
