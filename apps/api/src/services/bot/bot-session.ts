import { parsePgn } from '@freechesscoach/chess-analysis';
import type { BotClockConfig, BotConfig, PlayerColor } from '@freechesscoach/shared';
import * as gamesRepo from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import { commitBotMove, type PlayMovesDependencies } from '../play-moves.js';
import { createSessionForGame } from '../coach-agent-session.js';
import { selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

export type CreateBotSessionDependencies = PlayMovesDependencies & BotMoveSelectorDependencies;

/** "5+0" style label for games.timeControl (display only — the columns that
 * actually drive clock logic are clockInitialMs/clockIncrementMs). */
function formatTimeControlLabel(clock: BotClockConfig): string {
  return `${Math.round(clock.initialMs / 60000)}+${Math.round(clock.incrementMs / 1000)}`;
}

/**
 * Starts a fresh live game against a preset bot (the "Play vs Bot" plan) —
 * mirrors play-session.ts's createPlaySession exactly, but the opponent is
 * a silent Stockfish-driven bot rather than the coach. `botConfigSnapshot`
 * freezes a copy of the roster entry at game-start time, so a later roster
 * edit never rewrites the story of an already-played game. `clock` is
 * optional (null/omitted = untimed, "play with or without a timer") — both
 * sides start with the same initial budget.
 *
 * When the student picks Black, White (the bot) is on move first — nothing
 * else in this app ever drives a bot move except the student's own POST
 * /play-move, so without playing that opening move right here the game
 * would sit deadlocked forever (the student can't move a black piece before
 * White has moved, and nothing would ever prompt the bot to).
 */
export async function createBotSession(
  deps: CreateBotSessionDependencies,
  userId: string,
  studentColor: PlayerColor,
  bot: BotConfig,
  clock?: BotClockConfig | null
): Promise<SessionRow> {
  const game = await gamesRepo.insert(deps.db, {
    userId,
    pgn: '',
    source: 'vs_bot',
    userColor: studentColor,
    whiteName: studentColor === 'white' ? 'You' : bot.name,
    blackName: studentColor === 'black' ? 'You' : bot.name,
    result: null,
    timeControl: clock ? formatTimeControlLabel(clock) : null,
    eco: null,
    playedAt: new Date(),
    botId: bot.id,
    botConfigSnapshot: bot,
    clockInitialMs: clock?.initialMs ?? null,
    clockIncrementMs: clock?.incrementMs ?? null,
    whiteRemainingMs: clock?.initialMs ?? null,
    blackRemainingMs: clock?.initialMs ?? null
  });

  const session = await createSessionForGame(deps.db, { gameId: game.id, userId, mode: 'play_bot' });
  if (studentColor !== 'black') return session;

  const startFen = parsePgn(game.pgn).positions[0]?.fen;
  if (!startFen) throw new Error('createBotSession: parsePgn returned no starting position for an empty pgn');

  const selected = await selectBotMove(deps, startFen, 0, bot);
  const committed = await commitBotMove(deps, game.id, selected.san);
  if ('error' in committed) {
    throw new Error(`createBotSession: bot selected an illegal opening move "${selected.san}" (${committed.error})`);
  }

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, committed.ply);
  return { ...session, currentPly: committed.ply, subjectPly: committed.ply };
}
