import type { Kysely } from 'kysely';
import { gameOutcomeFromPgn, type GameOutcome } from '@freechesscoach/chess-analysis';
import type { BotConfig, MoveQuality } from '@freechesscoach/shared';
import * as gameMoveQualitiesRepo from '../../db/repositories/game-move-qualities.js';
import * as gamesRepo from '../../db/repositories/games.js';
import type { GameRow } from '../../db/repositories/games.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { JobQueue } from '../../jobs/queue.js';
import { commitBotMove, commitPlayerMove, type PlayMovesDependencies } from '../play-moves.js';
import { finalizeBotGame } from './bot-finalize.js';
import { selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

/** A fast shallow-depth bot reply is deliberately padded up to this floor so
 * it doesn't feel instant/robotic — see the "Play vs Bot" plan. Overridable
 * per-call via `minThinkMs` (tests set it to 0 to avoid real delays). */
export const MIN_BOT_THINK_MS = 900;

export interface BotMoveCommitDependencies extends PlayMovesDependencies, BotMoveSelectorDependencies {
  jobQueue: JobQueue;
  now?: () => number;
  minThinkMs?: number;
}

export interface CommittedTurnMove {
  fen: string;
  san: string;
  ply: number;
  quality: MoveQuality;
  elapsedMs: number;
}

export interface CommitBotTurnResult {
  player: CommittedTurnMove;
  bot: CommittedTurnMove | null;
  gameOver: { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null;
  /** Post-move remaining time for each side — null/null for an untimed game
   * (games.clockInitialMs === null). The mover's own think time (including,
   * for the bot, the artificial MIN_BOT_THINK_MS floor) is deducted and any
   * increment added after each of the two moves this call commits. */
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
}

/** Deducts one mover's elapsed think time from their remaining clock (never
 * below 0) and adds the increment — only ever called for a timed game, where
 * both remaining values are guaranteed non-null by the DB check constraint
 * (0021_bot_game_clock.ts); the `?? 0` fallbacks are just type narrowing. */
function applyClockTick(
  moverColor: 'white' | 'black',
  elapsedMs: number,
  incrementMs: number,
  whiteRemainingMs: number | null,
  blackRemainingMs: number | null
): { whiteRemainingMs: number; blackRemainingMs: number } {
  const remaining = moverColor === 'white' ? whiteRemainingMs : blackRemainingMs;
  const next = Math.max(0, (remaining ?? 0) - elapsedMs) + incrementMs;
  return moverColor === 'white'
    ? { whiteRemainingMs: next, blackRemainingMs: blackRemainingMs ?? 0 }
    : { whiteRemainingMs: whiteRemainingMs ?? 0, blackRemainingMs: next };
}

/**
 * The play_bot equivalent of commitPlayerMoveAndAdvance: commits the
 * student's move, then — unless it already ended the game — computes and
 * commits the bot's synchronous reply in the same call (see the "Play vs
 * Bot" plan for why this is one request/response, not a poll). Also owns
 * game-over detection: no equivalent exists for 'play' mode, where session
 * completion is only ever driven by the coach's own end_session tool call,
 * which a chat-less bot game never triggers. Once the game ends, enqueues
 * the standard-depth post-game analysis job the same way game-import.ts
 * does for an imported game — deliberately not the shallow depth the bot
 * played at, since that phase is about accurate review.
 */
export async function commitBotTurn(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  bot: BotConfig,
  playerSan: string
): Promise<CommitBotTurnResult | { error: string }> {
  const now = deps.now ?? Date.now;
  const minThinkMs = deps.minThinkMs ?? MIN_BOT_THINK_MS;

  const gameBefore = await requireGame(deps.db, session.gameId);
  const isTimed = gameBefore.clockInitialMs !== null;
  const incrementMs = gameBefore.clockIncrementMs ?? 0;
  let whiteRemainingMs = gameBefore.whiteRemainingMs;
  let blackRemainingMs = gameBefore.blackRemainingMs;

  const previousTimestamp =
    (await gameMoveQualitiesRepo.findLatestByGameId(deps.db, session.gameId))?.createdAt ?? session.startedAt;
  const playerElapsedMs = now() - previousTimestamp.getTime();

  const playerResult = await commitPlayerMove(deps, session.gameId, playerSan, { elapsedMs: playerElapsedMs });
  if ('error' in playerResult) return playerResult;
  const player: CommittedTurnMove = { ...playerResult, elapsedMs: playerElapsedMs };

  if (isTimed) {
    const moverColor = player.ply % 2 === 1 ? 'white' : 'black';
    ({ whiteRemainingMs, blackRemainingMs } = applyClockTick(moverColor, playerElapsedMs, incrementMs, whiteRemainingMs, blackRemainingMs));
    await gamesRepo.updateRemainingMs(deps.db, session.gameId, { whiteRemainingMs, blackRemainingMs });
  }

  const gameOverAfterPlayer = gameOverInfo(gameOutcomeFromPgn((await requireGame(deps.db, session.gameId)).pgn));
  if (gameOverAfterPlayer) {
    await finalizeBotGame(deps, session, player.ply, gameOverAfterPlayer.result);
    return { player, bot: null, gameOver: gameOverAfterPlayer, whiteRemainingMs, blackRemainingMs };
  }

  const thinkStart = now();
  const selected = await selectBotMove(deps, player.fen, player.ply, bot);
  const elapsedSoFar = now() - thinkStart;
  if (elapsedSoFar < minThinkMs) await sleep(minThinkMs - elapsedSoFar);
  const botElapsedMs = now() - thinkStart;

  const botResult = await commitBotMove(deps, session.gameId, selected.san, { elapsedMs: botElapsedMs });
  if ('error' in botResult) {
    throw new Error(`commitBotTurn: bot selected an illegal move "${selected.san}" (${botResult.error})`);
  }
  const botMove: CommittedTurnMove = { ...botResult, elapsedMs: botElapsedMs };

  if (isTimed) {
    const moverColor = botMove.ply % 2 === 1 ? 'white' : 'black';
    ({ whiteRemainingMs, blackRemainingMs } = applyClockTick(moverColor, botElapsedMs, incrementMs, whiteRemainingMs, blackRemainingMs));
    await gamesRepo.updateRemainingMs(deps.db, session.gameId, { whiteRemainingMs, blackRemainingMs });
  }

  const gameOverAfterBot = gameOverInfo(gameOutcomeFromPgn((await requireGame(deps.db, session.gameId)).pgn));
  if (gameOverAfterBot) {
    await finalizeBotGame(deps, session, botMove.ply, gameOverAfterBot.result);
    return { player, bot: botMove, gameOver: gameOverAfterBot, whiteRemainingMs, blackRemainingMs };
  }

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, botMove.ply);
  return { player, bot: botMove, gameOver: null, whiteRemainingMs, blackRemainingMs };
}

async function requireGame(db: Kysely<Database>, gameId: string): Promise<GameRow> {
  const game = await gamesRepo.findById(db, gameId);
  if (!game) throw new NotFoundError('Game not found');
  return game;
}

function gameOverInfo(outcome: GameOutcome): CommitBotTurnResult['gameOver'] {
  if (!outcome.isOver) return null;
  if (!outcome.result || !outcome.reason) {
    throw new Error('commitBotTurn: gameOutcomeFromPgn reported isOver without a result/reason');
  }
  return { result: outcome.result, reason: outcome.reason };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
