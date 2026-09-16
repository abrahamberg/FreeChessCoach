import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import type { PositionFeatures } from '@freechesscoach/shared';
import { overloadedDefenders } from '../piece-safety.js';
import { see } from '../see.js';
import { pins, type PinHit } from '../tactic-pins.js';
import { discoveredAttackDetail, type DiscoveredAttackHit } from '../tactic-discovered.js';
import { forcedReplies, type ForcedReply } from '../tactic-lookahead.js';
import { trappedPieces, type TrappedHit } from '../tactic-trapped.js';
import { forks } from '../tactics.js';
import type { AttackMap } from '../attack-map.js';

/**
 * Board computations more than one detector wants, done at most once per
 * move.
 *
 * Forty-odd detectors run over every move of every game, every ply of every
 * engine line, and thousands of quiet moves in the precision corpora. Several
 * of them ask the same expensive questions — `pins()` walks every slider's
 * rays, `see()` builds a `Chess` per capture in the exchange, and enumerating
 * the opponent's replies costs a `Chess` per reply — so asking them once and
 * sharing the answer is the difference between a scan that runs in seconds
 * and one that doesn't finish.
 *
 * Every entry is lazy: a detector that never asks never pays. The SEE caches
 * are keyed by square rather than precomputed for the whole board for the
 * same reason — most moves only ever ask about two or three squares.
 */
export interface TacticFacts {
  pinsBefore(): PinHit[];
  pinsAfter(): PinHit[];
  forksBefore(): PositionFeatures['forks'];
  forksAfter(): PositionFeatures['forks'];
  trappedBefore(): TrappedHit[];
  trappedAfter(): TrappedHit[];
  /** The *mover's* own pieces with nowhere safe to go, before the move —
   * which is what makes a piece doomed, and so what makes selling it a
   * desperado rather than a blunder. */
  moverTrappedBefore(): TrappedHit[];
  /** The mover's own pieces the opponent attacks, before the move — the
   * only squares worth an exchange evaluation, and the shared candidate list
   * for every defensive detector. */
  moverPiecesUnderAttack(): AttackedPiece[];
  overloadedAfter(): PositionFeatures['overloadedDefenders'];
  /** The opponent's legal answers to this move, or `null` when there are too
   * many for it to be forcing. See `tactic-lookahead.ts`. */
  replies(): ForcedReply[] | null;
  /** The piece this move unveiled an attack for, if any — asked by the two
   * discovered motifs, by the windmill, and by `clearance`, which only
   * claims the line it opened when nothing was standing at the end of it. */
  discovered(): DiscoveredAttackHit | null;
  /** SEE on `square` before the move, from `capturer`'s point of view. */
  exchangeBefore(square: Square, capturer: Color): number;
  /** The same after it. */
  exchangeAfter(square: Square, capturer: Color): number;
}

export interface TacticFactsInput {
  fenBefore: string;
  moveSan: string;
  before: Chess;
  beforeAttackMap: AttackMap;
  /** The position with the *opponent* to move, for the questions that only
   * make sense asked of the side that isn't on move (`trappedPieces` wants
   * the trapped side to move). `null` when the mover is in check and there
   * is no legal null move. */
  beforeNullMove: Chess | null;
  after: Chess | null;
  afterAttackMap: AttackMap | null;
  mover: Color;
  opponent: Color;
}

export function buildTacticFacts(input: TacticFactsInput): TacticFacts {
  const memo = new Map<string, unknown>();
  const once = <T>(key: string, compute: () => T): T => {
    if (!memo.has(key)) memo.set(key, compute());
    return memo.get(key) as T;
  };
  const fenAfter = () => once('fenAfter', () => input.after?.fen() ?? null);

  return {
    pinsBefore: () => once('pinsBefore', () => pins(input.before)),
    pinsAfter: () => once('pinsAfter', () => (input.after ? pins(input.after) : [])),
    forksBefore: () => once('forksBefore', () => forks(input.before, input.beforeAttackMap)),
    forksAfter: () => once('forksAfter', () => (input.after && input.afterAttackMap ? forks(input.after, input.afterAttackMap) : [])),
    trappedBefore: () => once('trappedBefore', () => (input.beforeNullMove ? trappedPieces(input.beforeNullMove, input.opponent) : [])),
    trappedAfter: () => once('trappedAfter', () => (input.after ? trappedPieces(input.after, input.opponent) : [])),
    moverTrappedBefore: () => once('moverTrappedBefore', () => trappedPieces(input.before, input.mover)),
    moverPiecesUnderAttack: () =>
      once('moverPiecesUnderAttack', () => attackedSquaresOf(input.before, input.beforeAttackMap, input.mover, input.opponent)),
    overloadedAfter: () =>
      once('overloadedAfter', () => (input.after && input.afterAttackMap ? overloadedDefenders(input.after, input.afterAttackMap) : [])),
    replies: () => once('replies', () => (fenAfter() ? forcedReplies(fenAfter()!) : null)),
    discovered: () =>
      once('discovered', () => (input.after ? discoveredAttackDetail(input.fenBefore, input.moveSan, input.mover) : null)),
    exchangeBefore: (square, capturer) => once(`b:${square}:${capturer}`, () => see(input.fenBefore, square, capturer)),
    exchangeAfter: (square, capturer) => {
      const fen = fenAfter();
      return fen === null ? 0 : once(`a:${square}:${capturer}`, () => see(fen, square, capturer));
    }
  };
}

export interface AttackedPiece {
  square: Square;
  type: PieceSymbol;
}

/** Squares holding a piece of `colour` that the other side attacks — the
 * only candidates worth an exchange evaluation, which is what keeps the
 * defensive detectors from running SEE over the whole board. */
export function attackedSquaresOf(chess: Chess, attackMap: AttackMap, colour: Color, attacker: Color): AttackedPiece[] {
  const attackerName = attacker === 'w' ? 'white' : 'black';
  return chess
    .board()
    .flat()
    .filter((piece): piece is { square: Square; type: PieceSymbol; color: Color } => piece !== null && piece.color === colour)
    .filter((piece) => (attackMap.attackersOf.get(piece.square)?.[attackerName].length ?? 0) > 0)
    .map((piece) => ({ square: piece.square, type: piece.type }));
}
