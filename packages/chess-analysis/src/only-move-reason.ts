import type { EngineEval, EngineLine } from '@freechesscoach/shared';
import type { PieceSymbol } from 'chess.js';
import { lineCaptures, quietLineGain, quietLinePrefix } from './board-facts/material.js';
import { isOnlyMove } from './board-facts/only-move.js';
import { CONFIG } from './config.js';
import { moverMateIn } from './mover-mate.js';
import { PIECE_NAMES } from './piece-names.js';
import { PIECE_VALUES } from './tactics.js';
import { toCpWhite, winPctFor } from './win-probability.js';

const { opportunityWinPctMin: WINNING_WIN_PCT } = CONFIG.miss;
const LOSING_WIN_PCT = 100 - WINNING_WIN_PCT;
/** A knight or a bishop: the least the next best move has to lose for its
 * loss to be named. */
const NAMED_LOSS_POINTS = 3;

type Side = 'white' | 'black';

/**
 * The one move that works, said as such (Task 121.3 and 125.5): "The only
 * winning move: the next best, Qd4, loses the queen", or on the move that
 * missed it, "Missed the only winning move, dxe6".
 *
 * `isOnlyMove` is the test the course quiz and the "only moves found" stat
 * already use. The words come from where the first two lines stand for the
 * mover: winning against not, holding against losing, or far apart in
 * between. Nothing is said when the second move still wins or the first
 * already loses. A mate is the mate notes' sentence, not this one.
 */
export function onlyMoveReason(input: { fenBefore: string; moveSan: string; mover: Side; evalBefore: EngineEval }): string | null {
  const [first, second] = input.evalBefore.lines;
  if (!first || !second || !isOnlyMove(input.evalBefore, first.moveSan, input.mover)) return null;
  if (moverMateIn(first, input.mover) !== null) return null;

  const what = onlyWhat(first, second, input.mover);
  if (!what) return null;
  if (first.moveSan !== input.moveSan) return `Missed ${what}, ${first.moveSan}`;
  const cost = nextBestCost(input.fenBefore, second, input.mover);
  return cost ? `${capitalised(what)}: the next best, ${second.moveSan}, ${cost}` : capitalised(what);
}

/** Null when the game is decided either way: a second move that still wins
 * (9.0 against 5.0) is slower, not bad, and with every move losing there is
 * no good one to name. */
function onlyWhat(first: EngineLine, second: EngineLine, mover: Side): string | null {
  const win = (line: EngineLine): number => winPctFor(mover, toCpWhite(line));
  if (win(second) >= WINNING_WIN_PCT || win(first) <= LOSING_WIN_PCT) return null;
  if (win(first) >= WINNING_WIN_PCT) return 'the only winning move';
  if (win(second) <= LOSING_WIN_PCT) return 'the only move that holds';
  return 'the only good move';
}

/** What the second line costs, when the board shows it: a mate, or a piece
 * that goes for next to nothing before the line goes quiet. A queen given
 * for a rook and a pawn is not "loses the queen" (34.Qd1 in `Ghlbfpc6`:
 * f6 Rxd2 Rxg7+ Kh8 Kxd2), so the net loss has to be the piece, give or
 * take a pawn. */
function nextBestCost(fenBefore: string, second: EngineLine, mover: Side): string | null {
  if (moverMateIn(second, mover === 'white' ? 'black' : 'white') !== null) return 'gets mated';
  const line = second.pvSan ?? [];
  if (line.length < 2) return null;
  const lost = largest(lineCaptures(fenBefore, quietLinePrefix(fenBefore, line))[mover === 'white' ? 'black' : 'white']);
  if (!lost || PIECE_VALUES[lost] < NAMED_LOSS_POINTS || -quietLineGain(fenBefore, line) < PIECE_VALUES[lost] - 1) return null;
  return `loses ${lost === 'q' ? 'the queen' : `a ${PIECE_NAMES[lost]}`}`;
}

function largest(pieces: readonly PieceSymbol[]): PieceSymbol | null {
  return [...pieces].sort((left, right) => PIECE_VALUES[right] - PIECE_VALUES[left])[0] ?? null;
}

const capitalised = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

const ONLY_MOVE_REASON = /^(The only (winning move|move that holds|good move)\b|Missed the only )/;

/** A move's plain reasons beside its tactic card: a card for the chance the
 * move took or missed names the same move with what it wins. */
export function withoutCardedOnlyMove(reasons: readonly string[], cards: { tacticOpportunity?: object | null }): string[] {
  return cards.tacticOpportunity ? reasons.filter((reason) => !ONLY_MOVE_REASON.test(reason)) : [...reasons];
}
