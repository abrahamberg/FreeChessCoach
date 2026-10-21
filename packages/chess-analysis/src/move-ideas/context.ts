import { Chess, type Color, type Move } from 'chess.js';
import type { EngineEval } from '@freechesscoach/shared';
import { opponentOf } from '../attack-map.js';
import { flipActiveColorFen } from '../null-move-fen.js';
import { FastBoard } from '../fast-board/board.js';

export interface MoveIdeasInput {
  fenBefore: string;
  san: string;
  /** The moves played before this one, from the game's start, so "moves
   * the knight a third time" can be counted. Empty when unknown. */
  previous: readonly Move[];
  /** The engine's view after the move: the line `prepares` reads. */
  evalAfter?: EngineEval;
  /** The engine's view before it: a sacrifice is only one the engine approves. */
  evalBefore?: EngineEval;
}

/** What every detector reads, built once per move. */
export interface IdeaContext {
  fenBefore: string;
  move: Move;
  mover: Color;
  enemy: Color;
  before: Chess;
  after: Chess;
  /** The mover to move again after the move (a null move), or null when the
   * move gives check. */
  again: Chess | null;
  /** The opponent to move in the position before (what it threatened). */
  enemyBefore: Chess | null;
  fullmove: number;
  previous: readonly Move[];
  evalAfter?: EngineEval;
  evalBefore?: EngineEval;
  /** The same four positions on the fast board, for move generation and
   * exchanges (`fast-board/`). Played on and always given back. */
  fast: { before: FastBoard; after: FastBoard; again: FastBoard | null; enemyBefore: FastBoard | null };
}

export function ideaContext(input: MoveIdeasInput): IdeaContext | null {
  const before = new Chess(input.fenBefore);
  let move: Move;
  try {
    move = new Chess(input.fenBefore).move(input.san);
  } catch {
    return null;
  }
  const again = flipActiveColorFen(move.after);
  const enemyBefore = flipActiveColorFen(input.fenBefore);
  return {
    fenBefore: input.fenBefore,
    move,
    mover: move.color,
    enemy: opponentOf(move.color),
    before,
    after: new Chess(move.after),
    again: again ? new Chess(again) : null,
    enemyBefore: enemyBefore ? new Chess(enemyBefore) : null,
    fullmove: Number(input.fenBefore.split(' ')[5] ?? '1'),
    previous: input.previous,
    evalAfter: input.evalAfter,
    evalBefore: input.evalBefore,
    fast: {
      before: FastBoard.fromFen(input.fenBefore),
      after: FastBoard.fromFen(move.after),
      again: again ? FastBoard.fromFen(again) : null,
      enemyBefore: enemyBefore ? FastBoard.fromFen(enemyBefore) : null
    }
  };
}

/** The moves between consecutive positions of a line, found by trying each
 * legal move: a game's history for `MoveIdeasInput.previous` when only its
 * positions are kept. */
export function movesOfLine(fens: readonly string[]): Move[] {
  const moves: Move[] = [];
  for (let index = 1; index < fens.length; index++) {
    const from = fens[index - 1];
    const to = fens[index];
    if (!from || !to) break;
    const key = to.split(' ').slice(0, 4).join(' ');
    const found = new Chess(from).moves({ verbose: true }).find((move) => move.after.split(' ').slice(0, 4).join(' ') === key);
    if (!found) break;
    moves.push(found);
  }
  return moves;
}
