import { BISHOP, BISHOP_RAYS, BLACK, colorOf, FastBoard, type FastMove, isAttacked, KING, KING_STEPS, KNIGHT, KNIGHT_JUMPS, PAWN, QUEEN, rankOf, ROOK, ROOK_RAYS, step, typeOf } from './board.js';

const PROMOTIONS = [QUEEN, ROOK, BISHOP, KNIGHT];

/** The side to move's legal moves, as chess.js generates them (promotions
 * four times, castling, en passant), optionally only from one square. */
export function legalMoves(board: FastBoard, from = -1): FastMove[] {
  const moves: FastMove[] = [];
  const mover = board.turn;
  for (const move of pseudoMoves(board, from)) {
    board.make(move);
    if (!board.inCheck(mover)) moves.push(move);
    board.unmake();
  }
  return moves;
}

/** Whether the side to move has a legal move at all (stops at the first). */
export function hasLegalMove(board: FastBoard): boolean {
  const mover = board.turn;
  for (const move of pseudoMoves(board, -1)) {
    board.make(move);
    const legal = !board.inCheck(mover);
    board.unmake();
    if (legal) return true;
  }
  return false;
}

/** The side to move is mated. */
export function isMate(board: FastBoard): boolean {
  return board.inCheck() && !hasLegalMove(board);
}

function pseudoMoves(board: FastBoard, only: number): FastMove[] {
  const moves: FastMove[] = [];
  const own = board.turn === 'b' ? BLACK : 0;
  for (let from = 0; from < 64; from++) {
    if (only >= 0 && from !== only) continue;
    const piece = board.squares[from] ?? 0;
    if (!piece || (piece & BLACK) !== own) continue;
    const type = typeOf(piece);
    if (type === PAWN) pawnMoves(board, from, piece, moves);
    else if (type === KNIGHT) stepMoves(board, from, piece, KNIGHT_JUMPS, moves);
    else if (type === KING) {
      stepMoves(board, from, piece, KING_STEPS, moves);
      castlingMoves(board, from, piece, moves);
    } else {
      const rays = type === BISHOP ? BISHOP_RAYS : type === ROOK ? ROOK_RAYS : [...ROOK_RAYS, ...BISHOP_RAYS];
      slideMoves(board, from, piece, rays, moves);
    }
  }
  return moves;
}

const move = (from: number, to: number, piece: number, captured: number, promotion = 0, enPassant = -1, rookFrom = -1, rookTo = -1): FastMove => ({ from, to, piece, captured, promotion, enPassant, rookFrom, rookTo });

function isEnemy(board: FastBoard, square: number, piece: number): boolean {
  const target = board.squares[square] ?? 0;
  return target !== 0 && (target & BLACK) !== (piece & BLACK);
}

function stepMoves(board: FastBoard, from: number, piece: number, offsets: readonly (readonly [number, number])[], moves: FastMove[]): void {
  for (const [df, dr] of offsets) {
    const to = step(from, df, dr);
    if (to < 0) continue;
    const target = board.squares[to] ?? 0;
    if (!target || isEnemy(board, to, piece)) moves.push(move(from, to, piece, target));
  }
}

function slideMoves(board: FastBoard, from: number, piece: number, rays: readonly (readonly [number, number])[], moves: FastMove[]): void {
  for (const [df, dr] of rays) {
    for (let to = step(from, df, dr); to >= 0; to = step(to, df, dr)) {
      const target = board.squares[to] ?? 0;
      if (!target) {
        moves.push(move(from, to, piece, 0));
        continue;
      }
      if (isEnemy(board, to, piece)) moves.push(move(from, to, piece, target));
      break;
    }
  }
}

function pawnMoves(board: FastBoard, from: number, piece: number, moves: FastMove[]): void {
  const white = colorOf(piece) === 'w';
  const forward = white ? 1 : -1;
  const lastRank = white ? 8 : 1;
  const add = (to: number, captured: number, enPassant = -1): void => {
    if (rankOf(to) === lastRank) for (const promotion of PROMOTIONS) moves.push(move(from, to, piece, captured, promotion | (piece & BLACK)));
    else moves.push(move(from, to, piece, captured, 0, enPassant));
  };
  const one = step(from, 0, forward);
  if (one >= 0 && !board.squares[one]) {
    add(one, 0);
    const two = step(one, 0, forward);
    if (rankOf(from) === (white ? 2 : 7) && two >= 0 && !board.squares[two]) add(two, 0);
  }
  for (const df of [-1, 1]) {
    const to = step(from, df, forward);
    if (to < 0) continue;
    if (isEnemy(board, to, piece)) add(to, board.squares[to] ?? 0);
    else if (to === board.ep) {
      const taken = step(to, 0, -forward);
      add(to, board.squares[taken] ?? 0, taken);
    }
  }
}

/** Castling as chess.js allows it: the right, empty squares between, and
 * the king not in check nor crossing or landing on an attacked square. */
function castlingMoves(board: FastBoard, from: number, piece: number, moves: FastMove[]): void {
  const white = colorOf(piece) === 'w';
  const home = white ? 60 : 4;
  if (from !== home) return;
  const enemy = white ? 'b' : 'w';
  const rook = ROOK | (piece & BLACK);
  const sides: [string, number, number[], number[]][] = [
    [white ? 'K' : 'k', home + 3, [home + 1, home + 2], [home + 1, home + 2]],
    [white ? 'Q' : 'q', home - 4, [home - 1, home - 2, home - 3], [home - 1, home - 2]]
  ];
  for (const [right, rookFrom, empty, passes] of sides) {
    if (!board.castling.includes(right) || board.squares[rookFrom] !== rook) continue;
    if (empty.some((square) => board.squares[square]) || isAttacked(board, home, enemy) || passes.some((square) => isAttacked(board, square, enemy))) continue;
    const to = passes[1] ?? home;
    moves.push(move(home, to, piece, 0, 0, -1, rookFrom, passes[0] ?? home));
  }
}
