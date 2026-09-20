import { isBookMoveFrom, type EvalScore } from '@freechesscoach/chess-analysis';
import type { EngineEval, MoveQuality } from '@freechesscoach/shared';
import { toEngineEval } from '../play-move-quality.js';
import { rateLastMove, saveLastMoveEval, savedEvalAtPly, type UnratedMove } from '../play-moves-rated.js';
import type { PlayMovesDependencies } from '../play-moves.js';
import { engineEvalFromScore } from './bot-move-grading.js';
import type { SelectedBotMove } from './bot-move-selector.js';
import type { RatingEvalDependencies } from './bot-rating-evals.js';

/**
 * Rating the two moves of a bot turn with NO engine call of its own, and saving
 * the engine's eval of the position each move leaves. Both moves are on the
 * board (unrated, and without an eval) by the time anything here runs:
 *
 * - the student's move: the bot's own search of the position that resulted IS
 *   its eval — saved with the move — and "before" is the light-engine eval of
 *   the position it was played from (background, bot-rating-evals.ts, has the
 *   lines, so "best" can be recognised) or, failing that, the eval saved with
 *   the previous move (a score only: it can be rated, not called "best"). A
 *   move the opening book knows needs neither: it is labelled 'book' — which is
 *   what the first move of every game is;
 * - the bot's move: its own eval was decided with the move (`evalAfter`: its
 *   line in the search, or the check that confirmed a mistake), and "before" is
 *   the same search.
 *
 * Evals are saved even when a rating cannot be computed, so every position
 * reached keeps its eval. A rating that cannot be computed leaves the move
 * unrated (null) and never fails or delays the turn. Post-game analysis rates
 * every move at standard depth; these labels are a live preview.
 */
export interface RatingContext {
  deps: PlayMovesDependencies & RatingEvalDependencies;
  gameId: string;
}

export interface PlayerMoveToRate {
  move: UnratedMove;
  mover: 'white' | 'black';
}

export function playerMoveToRate(move: UnratedMove): PlayerMoveToRate {
  return { move, mover: moverOfPly(move.ply) };
}

export async function ratePlayerMove(
  context: RatingContext,
  { move, mover }: PlayerMoveToRate,
  selected: SelectedBotMove
): Promise<MoveQuality | null> {
  // The position after the student's move, as the engine sees it — the bot's
  // own search of it, the same whichever move the bot then picks. A book reply
  // searched nothing, so there is none.
  const searched = selected.analysis?.lines[0];
  const evalAfter: EvalScore | undefined = searched ? { cp: searched.cp, mateIn: searched.mateIn } : undefined;
  if (evalAfter) {
    await safely(context, `saving the eval of ${move.san}`, () => saveLastMoveEval(context.deps.db, context.gameId, move.san, evalAfter));
  }

  // A move the opening book knows is a book move — no eval needed to say so.
  const isBookMove = isBookMoveFrom(move.fenBefore, move.san);
  const evalBefore = await evalBeforePlayerMove(context, move);
  if (!isBookMove && (!evalBefore || !evalAfter)) return null;

  return safelyRate(context, {
    san: move.san,
    ply: move.ply,
    mover,
    fenBefore: move.fenBefore,
    fenAfter: move.fen,
    evalBefore,
    evalAfter: evalAfter && engineEvalFromScore(move.fen, evalAfter),
    isBookMove
  });
}

export async function rateBotMove(context: RatingContext, move: UnratedMove, selected: SelectedBotMove): Promise<MoveQuality | null> {
  // A move the bot took from the book is a book move; nothing was searched.
  const isBookMove = selected.usedBook;
  if (!isBookMove && (!selected.analysis || !selected.evalAfter)) return null;

  return safelyRate(context, {
    san: move.san,
    ply: move.ply,
    mover: moverOfPly(move.ply),
    fenBefore: move.fenBefore,
    fenAfter: move.fen,
    evalBefore: selected.analysis ? toEngineEval(move.fenBefore, selected.analysis) : undefined,
    evalAfter: selected.evalAfter ? engineEvalFromScore(move.fen, selected.evalAfter) : undefined,
    computeDiagnosisCodes: true,
    isBookMove
  });
}

/** Lines from the light engine when they are ready (they say what the best move
 * was); otherwise the score saved with the previous move. */
async function evalBeforePlayerMove(context: RatingContext, move: UnratedMove): Promise<EngineEval | undefined> {
  const withLines = await context.deps.ratingEvals?.get(move.fenBefore);
  if (withLines) return withLines;

  const savedCp = await safely(context, `reading the eval before ${move.san}`, () => savedEvalAtPly(context.deps.db, context.gameId, move.ply - 1));
  return savedCp === undefined ? undefined : engineEvalFromScore(move.fenBefore, { cp: savedCp, mateIn: null });
}

async function safely<T>(context: RatingContext, what: string, task: () => Promise<T>): Promise<T | undefined> {
  try {
    return await task();
  } catch (error) {
    console.error(`bot rating: ${what} failed in game ${context.gameId}:`, error);
    return undefined;
  }
}

async function safelyRate(context: RatingContext, args: Parameters<typeof rateLastMove>[2]): Promise<MoveQuality | null> {
  try {
    return await rateLastMove(context.deps.db, context.gameId, args);
  } catch (error) {
    console.error(`bot rating: could not rate ${args.san} in game ${context.gameId}:`, error);
    return null;
  }
}

function moverOfPly(ply: number): 'white' | 'black' {
  return ply % 2 === 1 ? 'white' : 'black';
}
