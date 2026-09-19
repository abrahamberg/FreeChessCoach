import { parsePgn, plyToMoveRef } from '@freechesscoach/chess-analysis';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionMessagesRepo from '../../db/repositories/session-messages.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import { NotFoundError } from '../../lib/errors.js';
import { undoLastMove, type PlayMovesDependencies } from '../play-moves.js';

export interface UndoBotTurnResult {
  fen: string;
  ply: number;
}

/** Matched by apps/web's sessionMessages.ts to hide this note from the
 * visible transcript, same convention as coach-agent-session.ts's
 * `[session_start]`. */
export const UNDO_NOTICE_PREFIX = '[undo]';

/**
 * The self-serve Undo button (routes/sessions.ts's /undo-move) runs outside
 * any coach turn — unlike the `undo_last_move` tool, which the coach calls
 * itself mid-turn and so already knows about, this leaves the coach with no
 * chance to react in the moment. Without this note, the next turn's
 * `currentEpisode` (lib/episodes.ts) scan finds the transcript's tail still
 * tagged at the pre-undo ply and starts a silent, unexplained fresh episode
 * — the coach just resumes as if the position had always been this way, with
 * no idea the student changed their mind. Inserting this at `newPly` (a
 * plain `session_messages` append, never touching the removed ply's own
 * rows — see play-moves.ts's undoLastMove doc comment on why those stay
 * untouched) makes it the first thing the coach reads once the conversation
 * picks back up, in the same 'user'-role, ply-tagged shape every other
 * synthetic marker in this transcript already uses.
 *
 * `game.annotatedPgn`/`pgn` and `session_move_notes` are already corrected
 * by `undoLastMove` itself for every popped ply — this note exists purely to
 * surface the *event* in the conversation the coach replays, not to fix any
 * stale board/analysis data.
 */
function undoNoticeContent(newPly: number, fen: string): string {
  if (newPly === 0) {
    return `${UNDO_NOTICE_PREFIX} The student took back their move. The game is back to the starting position. FEN: ${fen}`;
  }
  const { moveNumber, color } = plyToMoveRef(newPly);
  const nextMover = color === 'white' ? 'Black' : 'White';
  return (
    `${UNDO_NOTICE_PREFIX} The student took back their last move. The game is back to the position right after ` +
    `${color}'s move ${moveNumber}. It's ${nextMover} to move. FEN: ${fen}`
  );
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
  // play_bot has no coach to inform (BotSessionPage is chat-less — see its
  // own doc comment); only 'play' replays a transcript a coach reads back.
  if (session.mode === 'play') {
    await sessionMessagesRepo.insert(deps.db, session.id, 'user', undoNoticeContent(newPly, result.fen), newPly);
  }
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
