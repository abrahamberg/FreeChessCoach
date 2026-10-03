import { Chess } from 'chess.js';
import { abandonedGuard, betterMoveFacts, replyFork } from './better-move.js';
import { replayMove } from '../inspect-move.js';
import { loosePieces, type LoosePiece } from './loose-pieces.js';
import { captureWords, lineBalance, settledLine } from './material.js';
import { boardFacts } from './move-facts.js';
import type { BoardFact } from './types.js';

/** What the move under discussion did and what the better one would have
 * done, all from the two engine analyses the coach already has: no engine
 * call of its own. */
export interface CurrentMoveFacts {
  /** The played move's own facts, without the loose pieces (`looseAfter` lists them with tiers). */
  played: BoardFact[];
  /** What the move stopped guarding, and the fork it allowed, against the opponent's best reply. */
  gaveUp: BoardFact[];
  /** Only for a move that is not the best: the best move's facts, and the material at the end of its settled line. */
  better?: { san: string; facts: BoardFact[]; material: string };
  /** Who takes what over the played move and the engine's continuation after it. */
  playedLine: string | null;
  /** Pieces either side could win after the move. */
  looseAfter: LoosePiece[];
}

export interface CurrentMoveInput {
  fenBefore: string;
  playedSan: string;
  /** The engine's best move from `fenBefore`, with its line; absent when there is none. */
  best?: { san: string; line: readonly string[] };
  /** The engine's best line from the position after the played move (`postMoveAnalysis.lines[0].pvSan`). */
  continuation: readonly string[];
}

export function currentMoveFacts({ fenBefore, playedSan, best, continuation }: CurrentMoveInput): CurrentMoveFacts {
  const afterChess = new Chess(fenBefore);
  try {
    afterChess.move(playedSan);
  } catch {
    return { played: [], gaveUp: [], playedLine: null, looseAfter: [] };
  }
  const fenAfter = afterChess.fen();
  const better = best && best.san !== playedSan ? best : undefined;
  return {
    played: boardFacts(fenBefore, playedSan).filter((fact) => fact.kind !== 'leavesHanging'),
    gaveUp: [...abandonedGuard(fenBefore, playedSan, continuation[0]), ...replyFork(fenAfter, continuation[0])],
    ...(better
      ? { better: { san: better.san, facts: betterMoveFacts(fenBefore, playedSan, better.san), material: lineBalance(fenBefore, settledLine(fenBefore, better.line)) } }
      : {}),
    playedLine: continuation.length ? captureWords(fenBefore, settledLine(fenBefore, [playedSan, ...continuation])) : null,
    // The mover's own come from `replayMove`, which leaves out a capture taken back: a trade.
    looseAfter: [...(replayMove(fenBefore, playedSan)?.leavesLoose ?? []), ...loosePieces(fenAfter, afterChess.turn())]
  };
}
