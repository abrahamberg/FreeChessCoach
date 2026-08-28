import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import { undoLastMove, type PlayMovesDependencies } from '../play-moves.js';

export interface UndoBotTurnResult {
  fen: string;
  ply: number;
}

/**
 * play_bot's "Undo" button: a bot's reply is always committed synchronously
 * in the same request as the student's own move (commitBotTurn), so the PGN's
 * last move is always the bot's — undoing just that one ply would strand the
 * game expecting a bot move with no way to produce one (the bot only ever
 * moves in response to a new student move). Removing both the bot's reply
 * and the student's move ahead of it is the only state that leaves the game
 * playable again, so this is "take back my last move" in the casual sense
 * that's normal for a bot game, not a literal single-ply undo.
 */
export async function undoLastBotTurn(
  deps: PlayMovesDependencies,
  session: SessionRow
): Promise<UndoBotTurnResult | { error: string }> {
  const botReply = await undoLastMove(deps, session.id, session.gameId);
  if ('error' in botReply) return botReply;

  const studentMove = await undoLastMove(deps, session.id, session.gameId);
  const result = 'error' in studentMove ? botReply : studentMove;
  // undoLastMove's removedPly names the ply that was POPPED (see
  // play-moves.ts), not the ply the game is left at — the resulting ply is
  // one below it.
  const newPly = result.removedPly - 1;

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, newPly);
  return { fen: result.fen, ply: newPly };
}
