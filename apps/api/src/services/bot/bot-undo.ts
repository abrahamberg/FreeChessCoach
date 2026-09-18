import { parsePgn } from '@freechesscoach/chess-analysis';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import { NotFoundError } from '../../lib/errors.js';
import { undoLastMove, type PlayMovesDependencies } from '../play-moves.js';

export interface UndoBotTurnResult {
  fen: string;
  ply: number;
}

/**
 * The student-initiated "Undo" button (BoardActionBar), shared by both live
 * sparring modes — play_bot originally, now also 'play' (a live game against
 * the coach). In play_bot, a bot's reply is normally committed synchronously
 * in the same request as the student's own move (commitBotTurn); in 'play',
 * the coach's reply lands separately, mid-turn, via its own play_coach_move
 * tool call — either way, once the opponent has replied, the PGN's last move
 * is theirs, and undoing just that one ply would strand the game expecting
 * a move from them with no way to produce one on demand. Removing both the
 * opponent's reply and the student's move ahead of it is the only state that
 * leaves the game playable again, so this is "take back my last move" in the
 * casual sense that's normal for a two-player game, not a literal
 * single-ply undo.
 *
 * That assumption breaks while the opponent hasn't replied yet — every
 * engine retry failed (bot-move-commit.ts's botPending), or the coach's own
 * turn is still in flight and hasn't called play_coach_move — so the PGN's
 * last move is the student's own, with no reply to pop yet. Popping twice in
 * that state would delete the student's real move *and* the previous turn's
 * already-settled opponent reply — checked here via whether the PGN's actual
 * last move (not the caller's possibly-stale `session.currentPly`) belongs
 * to the student (pending) or the opponent (normal case).
 */
export async function undoLastBotTurn(
  deps: PlayMovesDependencies,
  session: SessionRow
): Promise<UndoBotTurnResult | { error: string }> {
  const game = await gamesRepo.findById(deps.db, session.gameId);
  if (!game) throw new NotFoundError('Game not found');

  const lastPly = parsePgn(game.pgn).positions.at(-1)?.ply;
  if (lastPly === undefined || lastPly === 0) return { error: 'no move to undo' };
  const lastMover = lastPly % 2 === 1 ? 'white' : 'black';
  const isBotPending = lastMover === game.userColor;

  const first = await undoLastMove(deps, session.id, session.gameId);
  if ('error' in first) return first;

  const result = isBotPending ? first : await secondPop(deps, session, first);
  // undoLastMove's removedPly names the ply that was POPPED (see
  // play-moves.ts), not the ply the game is left at — the resulting ply is
  // one below it.
  const newPly = result.removedPly - 1;

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, newPly);
  return { fen: result.fen, ply: newPly };
}

async function secondPop(
  deps: PlayMovesDependencies,
  session: SessionRow,
  botReply: { fen: string; removedPly: number }
): Promise<{ fen: string; removedPly: number }> {
  const studentMove = await undoLastMove(deps, session.id, session.gameId);
  return 'error' in studentMove ? botReply : studentMove;
}
