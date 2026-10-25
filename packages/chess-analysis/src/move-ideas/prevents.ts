import { Chess, type Color } from 'chess.js';
import { CONFIG } from '../config.js';
import { attackersOf, BLACK, colorOf, type FastBoard, type FastMove, KNIGHT, PAWN, QUEEN, ROOK, squareOf, step, symbolOf, typeOf } from '../fast-board/board.js';
import { isMate, legalMoves } from '../fast-board/moves.js';
import { seeOnBoard } from '../see.js';
import { PIECE_VALUES } from '../tactics.js';
import type { IdeaContext } from './context.js';
import { pinsOf } from './memo.js';
import { attacksFrom, BIG_CENTRE, CENTRE, ownRank } from './squares.js';
import type { PieceAt } from '../board-facts/types.js';
import type { MoveIdea, PreventedBecause } from './types.js';

const { minThreatSeeCp: MIN_WON_SEE_CP } = CONFIG.evalWitness;
const PREVENTED_ORDER: PreventedBecause[] = ['check', 'pin', 'attack', 'break', 'advance', 'outpost', 'invade'];

/**
 * A move the opponent wanted that the moved man now stops: it lands on a
 * square the move newly covers, and loses material there now where it did
 * not before (h3 against …Bg4 pinning the knight, …a6 against Bb5).
 */
export function prevents(context: IdeaContext): MoveIdea | null {
  const { after, before, move, fast } = context;
  const wantedFrom = fast.enemyBefore;
  // A check answers itself, and a capture's point is what it takes: a
  // prevention is the quiet move's reason (h3, …a6, a3).
  if (!wantedFrom || move.san.includes('+') || move.captured) return null;
  const covered = new Set(attacksFrom(after, move.to).filter((square) => !attacksFrom(before, move.from).includes(square) || move.piece === 'p'));
  const found: ({ wanted: FastMove } & Reason)[] = [];
  for (const wanted of legalMoves(wantedFrom)) {
    const to = squareOf(wanted.to);
    const pawn = typeOf(wanted.piece) === PAWN;
    // The move standing on the wanted square, or moving the man that wanted to go, is no prevention to name.
    if (wanted.captured || symbolOf(wanted.piece) === 'k' || squareOf(wanted.from) === move.to || to === move.to) continue;
    // A pawn break may be stopped from afar (a rook behind it); a piece's
    // square only by the man the move put on it.
    if (!covered.has(to) && !(pawn && isBreak(wantedFrom, wanted))) continue;
    if (!nowLoses(fast.after, wanted) || exchangeAfter(wantedFrom, wanted) >= MIN_WON_SEE_CP) continue;
    const reason = wantedFor(wantedFrom, wanted);
    if (reason) found.push({ wanted, ...reason });
  }
  const [best] = found.sort((a, b) => PREVENTED_ORDER.indexOf(a.because) - PREVENTED_ORDER.indexOf(b.because));
  if (!best) return null;
  const { wanted, ...reason } = best;
  return { kind: 'prevents', san: sanOf(wantedFrom, wanted), ...reason };
}

/** Why the wanted move mattered, with the man it would have hit when there is one. */
interface Reason {
  because: PreventedBecause;
  target?: PieceAt;
  loose?: boolean;
}

/** What the mover wins on the square after `wanted` is played on `board`. */
function exchangeAfter(board: FastBoard, wanted: FastMove): number {
  board.make(wanted);
  board.ep = -1;
  const gain = seeOnBoard(board, wanted.to);
  board.unmake();
  return gain;
}

/** After the move, the wanted move is illegal or drops material. */
function nowLoses(after: FastBoard, wanted: FastMove): boolean {
  const same = legalMoves(after, wanted.from).find((each) => each.to === wanted.to && each.promotion === wanted.promotion);
  return !same || exchangeAfter(after, same) >= MIN_WON_SEE_CP;
}

/** What the opponent's move would have done: check, pin, attack a bigger
 * or a loose piece, a pawn break or centre advance, a knight on a forward
 * square, an invasion. */
function wantedFor(board: FastBoard, wanted: FastMove): Reason | null {
  const side = colorOf(wanted.piece);
  const attackedBefore = attackedFrom(board, wanted.from, side);
  board.make(wanted);
  const reason = reasonOn(board, wanted, side, attackedBefore);
  board.unmake();
  if (reason) return reason;
  if (typeOf(wanted.piece) === PAWN && isBreak(board, wanted)) return { because: 'break' };
  const to = squareOf(wanted.to);
  if (typeOf(wanted.piece) === PAWN && CENTRE.includes(to)) return { because: 'advance' };
  if (typeOf(wanted.piece) === KNIGHT && ownRank(to, side) >= 4 && BIG_CENTRE.includes(to)) return { because: 'outpost' };
  // An invasion: a knight jumping into the enemy half, or a rook or queen
  // going deep (…Ng4, …Nb4, …Rc2); a bishop's or queen's mere excursion is not one.
  const type = typeOf(wanted.piece);
  const deep = type === KNIGHT ? 5 : type === ROOK || type === QUEEN ? 6 : 9;
  return ownRank(squareOf(wanted.from), side) <= 4 && ownRank(to, side) >= deep ? { because: 'invade' } : null;
}

/** The enemy men the man on `from` already attacks: hitting them again from a new square is no new attack. */
function attackedFrom(board: FastBoard, from: number, side: Color): Set<number> {
  const hit = new Set<number>();
  for (let index = 0; index < 64; index++) {
    const piece = board.squares[index] ?? 0;
    if (piece && colorOf(piece) !== side && attackersOf(board, index, side).includes(from)) hit.add(index);
  }
  return hit;
}

/** On the board after the wanted move: check, pin, or a new attack on a man
 * worth more than the mover or on one nothing defends. */
function reasonOn(board: FastBoard, wanted: FastMove, side: Color, attackedBefore: Set<number>): Reason | null {
  const other: Color = side === 'w' ? 'b' : 'w';
  // A mate is no "check" to prevent: `stopsMate` says it.
  if (board.inCheck(other) && !isMate(board)) return { because: 'check' };
  const fen = board.toFen();
  const next = new Chess(fen);
  const pin = pinsOf(fen).find((hit) => hit.by === squareOf(wanted.to) && next.get(hit.pinned)?.type !== 'p');
  const pinned = pin && next.get(pin.pinned);
  if (pin && pinned) return { because: 'pin', target: { piece: pinned.type, square: pin.pinned } };
  for (let index = 0; index < 64; index++) {
    const piece = board.squares[index] ?? 0;
    if (!piece || colorOf(piece) !== other || typeOf(piece) === PAWN || symbolOf(piece) === 'k' || attackedBefore.has(index)) continue;
    if (!attackersOf(board, index, side).includes(wanted.to)) continue;
    const target: PieceAt = { piece: symbolOf(piece), square: squareOf(index) };
    if (PIECE_VALUES[symbolOf(piece)] > PIECE_VALUES[symbolOf(wanted.piece)]) return { because: 'attack', target };
    if (attackersOf(board, index, other).length === 0) return { because: 'attack', target, loose: true };
  }
  return null;
}

/** A pawn push that attacks an enemy pawn: the break that frees a game (…c5 against d4). */
function isBreak(board: FastBoard, wanted: FastMove): boolean {
  if (typeOf(wanted.piece) !== PAWN || wanted.captured) return false;
  const forward = colorOf(wanted.piece) === 'w' ? 1 : -1;
  const enemyPawn = PAWN | (wanted.piece & BLACK ? 0 : BLACK);
  return [-1, 1].some((df) => {
    const square = step(wanted.to, df, forward);
    return square >= 0 && board.squares[square] === enemyPawn;
  });
}

function sanOf(board: FastBoard, move: FastMove): string {
  return new Chess(board.toFen()).move({ from: squareOf(move.from), to: squareOf(move.to), promotion: move.promotion ? symbolOf(move.promotion) : undefined }).san;
}
