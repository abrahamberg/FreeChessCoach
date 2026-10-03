import { Chess } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { replyFork } from './board-facts/better-move.js';
import { forks, type Fork } from './board-facts/forks.js';
import type { PieceAt } from './board-facts/types.js';
import { PIECE_NAMES } from './piece-names.js';
import { wonPieceReason } from './won-piece-reason.js';

/**
 * The forks a move makes, misses or lets the other side make, and the piece
 * a sound capture wins, from the board facts (`board-facts/forks.ts`). In
 * Dany_Abr–TonyCorry 12.Qf4 read only "Your queen stopped guarding e2",
 * 12…Bxd5 only "Trades bishops on d5", and 13…Ne2+ and 14…Nxf4 nothing: the
 * fork of the king and the queen, the story of the game, was never said.
 */
export interface ForkReasonInput {
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  moveSan: string;
  evalBefore: EngineEval;
  evalAfter?: EngineEval;
  isRecapture?: boolean;
}

export interface ForkReason {
  category: 'tactical' | 'material';
  text: string;
}

/** Forks the opponent now has that they did not have before a move that
 * cost something, and the fork the engine's reply makes ("Allows Ne2+,
 * forking the king on g1 and the queen on f4"). */
export function allowedForkReasons(input: ForkReasonInput, isFault: boolean): ForkReason[] {
  if (!isFault) return [];
  const opponent = input.mover === 'white' ? 'b' : 'w';
  const key = (fork: Fork): string => `${fork.piece.piece}${fork.piece.square}`;
  const before = new Set(forks(input.fenBefore, opponent).map(key));
  const standing = forks(input.fenAfter, opponent)
    .filter((fork) => !before.has(key(fork)))
    .map((fork): ForkReason => ({
      category: 'tactical',
      text: `Allows a fork: the ${PIECE_NAMES[fork.piece.piece]} on ${fork.piece.square} hits ${targetWords(fork.targets)}`
    }));
  const reply = replyFork(input.fenAfter, input.evalAfter?.lines[0]?.moveSan)[0];
  return reply?.kind === 'replyForks' ? [{ category: 'tactical', text: `Allows ${reply.replySan}, forking ${targetWords(reply.targets)}` }, ...standing] : standing;
}

/** "Missed Ne2+, forking the king on g1 and the queen on f4": the engine's
 * move forked and the played one, which cost something, did not. */
export function missedForkReasons(input: ForkReasonInput, isFault: boolean): ForkReason[] {
  const best = input.evalBefore.lines[0]?.moveSan;
  if (!isFault || !best || best === input.moveSan) return [];
  const fork = forkByMovedPiece(input.fenBefore, best);
  return fork ? [{ category: 'tactical', text: `Missed ${best}, forking ${targetWords(fork.targets)}` }] : [];
}

/** What a sound move won: the fork it made ("Forks the king on g1 and the
 * queen on f4"), the piece it took ("Wins the queen on f4"). A recapture is
 * "Recaptures" (`trade-description.ts`). */
export function gainReasons(input: ForkReasonInput, isFault: boolean): ForkReason[] {
  if (isFault) return [];
  const fork = forkByMovedPiece(input.fenBefore, input.moveSan);
  const won = input.isRecapture ? null : wonPieceReason(input.fenBefore, input.moveSan);
  return [...(fork ? [{ category: 'tactical' as const, text: `Forks ${targetWords(fork.targets)}` }] : []), ...(won ? [{ category: 'material' as const, text: won }] : [])];
}

const FORK_NOTE = /^(Forks |(Missed|Allows) \S+, forking )/;
const WON_NOTE = /^Wins the /;

/** A tactic card says the same thing in its own words: the note goes. */
export function withoutCardedGain(reasons: readonly string[], cards: { tacticOpportunity?: { type: string; found: boolean } | null; tacticAllowed?: { type: string } | null }): string[] {
  const forkCarded = cards.tacticOpportunity?.type === 'fork' || cards.tacticAllowed?.type === 'fork';
  const wonCarded = cards.tacticOpportunity?.found === true;
  return reasons.filter((reason) => !(forkCarded && FORK_NOTE.test(reason)) && !(wonCarded && WON_NOTE.test(reason)));
}

/** Never a mate: 8…Nd3# "forks the king and the bishop" is checkmate. */
function forkByMovedPiece(fen: string, san: string): Fork | null {
  const board = new Chess(fen);
  let move;
  try {
    move = board.move(san);
  } catch {
    return null;
  }
  if (board.isCheckmate()) return null;
  return forks(board.fen(), move.color).find((fork) => fork.piece.square === move.to) ?? null;
}

/** The king first: "the king on g1 and the queen on f4". */
function targetWords(targets: readonly PieceAt[]): string {
  const words = [...targets].sort((a, b) => Number(b.piece === 'k') - Number(a.piece === 'k')).map((target) => `the ${PIECE_NAMES[target.piece]} on ${target.square}`);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}
