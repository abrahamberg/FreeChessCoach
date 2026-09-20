import type { Kysely } from 'kysely';
import {
  appendAnnotatedMove,
  appendMoveToPgn,
  extractPgnMoveComments,
  replaceLastMoveAnnotation,
  setLastMoveEval,
  toAnnotatedMoveData,
  type EvalScore
} from '@freechesscoach/chess-analysis';
import type { EngineEval, MoveQuality } from '@freechesscoach/shared';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import { classifyPlayMoveWithEvals } from './play-move-quality.js';
import { currentFen, withGameLock, type CommitMoveOptions } from './play-moves.js';

/** A move that is on the board but not yet rated. */
export interface UnratedMove {
  fen: string;
  san: string;
  ply: number;
  /** The position the move was played from — what rating it needs. */
  fenBefore: string;
}

/**
 * Appends a move to the game's `pgn` and `annotatedPgn` (one transaction, same
 * as every other commit) with no engine call and no annotation, so the
 * position, the session pointer and the bot's reply never wait on rating.
 * `rateLastMove` fills the annotation in once the numbers exist.
 */
export async function commitMoveUnrated(
  db: Kysely<Database>,
  gameId: string,
  san: string,
  options?: CommitMoveOptions
): Promise<UnratedMove | { error: string }> {
  return withGameLock(gameId, async () => {
    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new NotFoundError('Game not found');

    const fenBefore = currentFen(game.pgn);
    const applied = appendMoveToPgn(game.pgn, san, options);
    if ('error' in applied) return applied;
    const annotated = appendAnnotatedMove(game.annotatedPgn ?? game.pgn, san, null, options);
    if ('error' in annotated) return annotated;

    // One transaction, not two: `pgn` and `annotatedPgn` must land together
    // (see commitMoveLocked in play-moves.ts for why).
    await db.transaction().execute(async (trx) => {
      await gamesRepo.updatePgn(trx, gameId, applied.pgn);
      await gamesRepo.updateAnnotatedPgn(trx, gameId, annotated.pgn, new Date());
    });

    return { fen: applied.fen, san: applied.san, ply: applied.ply, fenBefore };
  });
}

export interface RateMoveArgs {
  san: string;
  ply: number;
  mover: 'white' | 'black';
  fenBefore: string;
  fenAfter: string;
  /** Lines at `fenBefore` (was the move the best one?). Optional for a book move. */
  evalBefore?: EngineEval;
  /** Only its first line's score is read. Optional for a book move. */
  evalAfter?: EngineEval;
  /** The opening book knows the move: it is labelled 'book'. */
  isBookMove?: boolean;
  /** The bot's own moves also get the real diagnostics registry's read. */
  computeDiagnosisCodes?: boolean;
}

/**
 * Rates the game's LAST move from evals the caller already has and writes the
 * annotation onto it. Returns the quality, or null when the move can no longer
 * be rated — the last move is not `args.san` any more (an undo raced this), in
 * which case nothing is written. Only `annotatedPgn` changes: `pgn` and
 * `lastMoveAt` (which the clock logic reads) are left alone.
 */
export async function rateLastMove(db: Kysely<Database>, gameId: string, args: RateMoveArgs): Promise<MoveQuality | null> {
  return withGameLock(gameId, async () => {
    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new NotFoundError('Game not found');

    const classified = classifyPlayMoveWithEvals(
      {
        ply: args.ply,
        moveSan: args.san,
        mover: args.mover,
        fenBefore: args.fenBefore,
        fenAfter: args.fenAfter,
        userColor: game.userColor,
        computeDiagnosisCodes: args.computeDiagnosisCodes ?? false,
        ...(args.isBookMove ? { isBookMove: true } : {})
      },
      args.evalBefore,
      args.evalAfter
    );

    const annotated = replaceLastMoveAnnotation(game.annotatedPgn ?? game.pgn, args.san, toAnnotatedMoveData(classified));
    if ('error' in annotated) return null;

    await gamesRepo.updateAnnotatedPgn(db, gameId, annotated.pgn);
    return classified.quality;
  });
}

/**
 * Saves the engine's eval of the position the game's LAST move leaves, in that
 * move's `[%eval]` comment (both mainlines, one transaction). A move is saved
 * before its eval is known, so this is how the student's move gets one once the
 * bot's search has looked at the position; with it, returning to the position
 * later (undo, a resumed game, the eval graph) never has to ask the engine
 * again, and the next move's rating has its "before" score. False when the last
 * move is no longer `san` (an undo raced it) — nothing is written then.
 */
export async function saveLastMoveEval(db: Kysely<Database>, gameId: string, san: string, score: EvalScore): Promise<boolean> {
  return withGameLock(gameId, async () => {
    const game = await gamesRepo.findById(db, gameId);
    if (!game) throw new NotFoundError('Game not found');

    const pgn = setLastMoveEval(game.pgn, san, score);
    if ('error' in pgn) return false;
    const annotated = game.annotatedPgn ? setLastMoveEval(game.annotatedPgn, san, score) : null;
    if (annotated && 'error' in annotated) return false;

    await db.transaction().execute(async (trx) => {
      await gamesRepo.updatePgn(trx, gameId, pgn.pgn);
      if (annotated) await gamesRepo.updateAnnotatedPgn(trx, gameId, annotated.pgn);
    });
    return true;
  });
}

/** The eval saved with the move at `ply` (the position that move left), as a
 * White-perspective centipawn score — a mate is saturated, as everywhere the
 * `[%eval]` comment is read. Undefined when that move has none. */
export async function savedEvalAtPly(db: Kysely<Database>, gameId: string, ply: number): Promise<number | undefined> {
  const game = await gamesRepo.findById(db, gameId);
  if (!game) throw new NotFoundError('Game not found');
  return extractPgnMoveComments(game.pgn).find((comment) => comment.ply === ply)?.evalCp ?? undefined;
}
