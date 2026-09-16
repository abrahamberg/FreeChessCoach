import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { occupiedSquares, opponentOf, toColorName, type AttackMap } from './attack-map.js';
import { PIECE_NAMES } from './piece-names.js';
import { see } from './see.js';
import { PIECE_VALUES } from './tactics.js';

/** Small board questions the claim detectors and the claim verifier both
 * ask, in one place so "is this piece defended?" means the same thing on
 * both sides of the propose/verify split. Every function here is a fact
 * about a position — no motif logic, no thresholds. */

export function pieceNameAt(chess: Chess, square: Square): string {
  const piece = chess.get(square);
  return piece ? PIECE_NAMES[piece.type] : 'piece';
}

export function pieceValueAt(chess: Chess, square: Square): number {
  const piece = chess.get(square);
  return piece ? PIECE_VALUES[piece.type] : 0;
}

export function defendersOf(attackMap: AttackMap, square: Square, owner: Color): Square[] {
  return attackMap.attackersOf.get(square)?.[toColorName(owner)] ?? [];
}

export function attackersOf(attackMap: AttackMap, square: Square, attacker: Color): Square[] {
  return attackMap.attackersOf.get(square)?.[toColorName(attacker)] ?? [];
}

export function kingSquareOf(chess: Chess, color: Color): Square | null {
  return occupiedSquares(chess).find((piece) => piece.type === 'k' && piece.color === color)?.square ?? null;
}

/**
 * Would `capturer` come out ahead taking whatever stands on `square`, once
 * the whole exchange plays out? The SEE in `see.ts` answers exactly this and
 * no detector called it before `docs/tactics-rework.md` §4 cause 1.
 *
 * Note the sign convention: `see()` is already from `capturer`'s point of
 * view, so "profitable" is simply positive.
 */
export function isProfitableCaptureOn(fen: string, square: Square, capturer: Color, threshold = 0): boolean {
  return see(fen, square, capturer) > threshold;
}

/**
 * Can the opponent simply take the piece that just moved, and come out
 * ahead? This is Lichess's own `is_in_bad_spot` guard on a forking piece —
 * a bishop that forks two pawns while standing en prise has not forked
 * anything, it has been traded.
 *
 * Deliberately NOT a veto on every motif: `docs/tactics-rework.md` §2
 * prototyped that and it deletes sacrificial tactics (TR-07's whole point is
 * that the bishop is hanging). It is applied per motif, only where the
 * motif's own mechanism depends on the actor surviving.
 */
export function actorIsHanging(fenAfter: string, actor: Square, owner: Color): boolean {
  return isProfitableCaptureOn(fenAfter, actor, opponentOf(owner));
}

/** Static material balance in pawns, from `color`'s point of view. */
export function materialBalance(chess: Chess, color: Color): number {
  let balance = 0;
  for (const piece of occupiedSquares(chess)) {
    if (piece.type === 'k') continue;
    balance += piece.color === color ? PIECE_VALUES[piece.type] : -PIECE_VALUES[piece.type];
  }
  return balance;
}

/** Every enemy piece `from` attacks in `chess`, cheapest square first — the
 * raw material a fork/double-attack claim is built out of. */
export function enemyTargetsOf(chess: Chess, attackMap: AttackMap, from: Square, opponent: Color): Square[] {
  return (attackMap.controlledBy.get(from) ?? []).filter((square) => chess.get(square)?.color === opponent);
}

export function pieceTypeAt(chess: Chess, square: Square): PieceSymbol | null {
  return chess.get(square)?.type ?? null;
}

/** "c7, e7 and g8" — the list form every detail sentence uses. */
export function formatSquareList(squares: readonly string[]): string {
  if (squares.length <= 1) return squares[0] ?? '';
  return `${squares.slice(0, -1).join(', ')} and ${squares[squares.length - 1]}`;
}
