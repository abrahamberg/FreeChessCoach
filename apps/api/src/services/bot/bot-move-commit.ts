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
import { commitBotMove, commitPlayerMove, currentFen, type PlayMovesDependencies } from '../play-moves.js';
import { moverToMoveNext } from './bot-claim-timeout.js';
import { finalizeBotGame } from './bot-finalize.js';
import { BotSelectionError, selectBotMove, type BotMoveSelectorDependencies } from './bot-move-selector.js';

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
  /** True iff the player's move is committed but the bot's reply isn't —
   * every engine attempt in selectBotMove's own retry loop failed. The
   * session's ply pointer already reflects the player's move at this point
   * (see commitBotTurn's doc comment), so the client can retry getting just
   * the bot's move via requestBotMove without resubmitting anything. */
  botPending?: boolean;
}

/** requestBotMove's result: same shape as CommitBotTurnResult, but there's
 * no new student move to report (it's the failover retry, not a fresh
 * "your move" round trip) — `player` is always null. */
export interface RequestBotMoveResult {
  player: null;
  bot: CommittedTurnMove | null;
  gameOver: CommitBotTurnResult['gameOver'];
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
  botPending?: boolean;
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

interface ClockState {
  isTimed: boolean;
  incrementMs: number;
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
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
 *
 * The session's ply pointer is advanced to the player's move immediately,
 * before the bot's reply is even attempted — not deferred to the end like
 * the rest of this function's DB writes. That's deliberate: selectBotMove's
 * engine call can still fail even after its own retries (contention with a
 * background analysis job, an engine outage), and if the pointer only moved
 * on full success, the player's move would sit committed in the game's PGN
 * while the session still thought it was waiting on it — indistinguishable
 * from corruption, and unrecoverable from the client (resubmitting the same
 * move fails since the position has already moved past it). With the
 * pointer moved up front, a failed bot reply just leaves the game correctly
 * "waiting on the bot" — see the botPending return and requestBotMove below.
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
  const clock: ClockState = {
    isTimed: gameBefore.clockInitialMs !== null,
    incrementMs: gameBefore.clockIncrementMs ?? 0,
    whiteRemainingMs: gameBefore.whiteRemainingMs,
    blackRemainingMs: gameBefore.blackRemainingMs
  };

  const previousTimestamp =
    (await gameMoveQualitiesRepo.findLatestByGameId(deps.db, session.gameId))?.createdAt ?? session.startedAt;
  const playerElapsedMs = now() - previousTimestamp.getTime();

  const playerResult = await commitPlayerMove(deps, session.gameId, playerSan, { elapsedMs: playerElapsedMs });
  if ('error' in playerResult) return playerResult;
  const player: CommittedTurnMove = { ...playerResult, elapsedMs: playerElapsedMs };

  if (clock.isTimed) {
    const moverColor = player.ply % 2 === 1 ? 'white' : 'black';
    const ticked = applyClockTick(moverColor, playerElapsedMs, clock.incrementMs, clock.whiteRemainingMs, clock.blackRemainingMs);
    clock.whiteRemainingMs = ticked.whiteRemainingMs;
    clock.blackRemainingMs = ticked.blackRemainingMs;
    await gamesRepo.updateRemainingMs(deps.db, session.gameId, ticked);
  }

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, player.ply);

  const gameOverAfterPlayer = gameOverInfo(gameOutcomeFromPgn((await requireGame(deps.db, session.gameId)).pgn));
  if (gameOverAfterPlayer) {
    await finalizeBotGame(deps, session, player.ply, gameOverAfterPlayer.result);
    return { player, bot: null, gameOver: gameOverAfterPlayer, whiteRemainingMs: clock.whiteRemainingMs, blackRemainingMs: clock.blackRemainingMs };
  }

  try {
    const reply = await commitBotReply(deps, session, bot, player.ply, player.fen, clock, now, minThinkMs);
    return { player, ...reply };
  } catch (error) {
    // A BotSelectionError means the engine call itself succeeded but
    // selection produced something unusable (no candidates, an illegal
    // move) — a deterministic bug that will fail identically on every
    // failover retry, not a transient outage. Reporting that as botPending
    // would just strand the game behind an indefinite client-side poll, so
    // it's rethrown as the visible failure it actually is instead.
    if (error instanceof BotSelectionError) throw error;

    // Every attempt in selectBotMove's own retry loop failed. The player's
    // move already stands (the pointer update above already reflects it),
    // so report the bot's reply as pending rather than failing the whole
    // request — see requestBotMove and the session page's failover poll.
    // Logged (not just swallowed) since this is otherwise invisible: the
    // client only ever sees botPending, never the actual failure reason.
    console.error(`commitBotTurn: bot reply failed for session ${session.id}, leaving it botPending:`, error);
    return { player, bot: null, gameOver: null, whiteRemainingMs: clock.whiteRemainingMs, blackRemainingMs: clock.blackRemainingMs, botPending: true };
  }
}

/**
 * Computes and commits just the bot's reply for the position the game is
 * currently sitting at — no new player move. Used both by commitBotTurn
 * above (right after the player's move) and by the failover path below
 * (recovering a bot reply that never landed the first time). Throws on an
 * engine failure — both callers decide for themselves how to report that.
 */
async function commitBotReply(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  bot: BotConfig,
  afterPly: number,
  fen: string,
  clock: ClockState,
  now: () => number,
  minThinkMs: number
): Promise<{
  bot: CommittedTurnMove;
  gameOver: CommitBotTurnResult['gameOver'];
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
}> {
  let { whiteRemainingMs, blackRemainingMs } = clock;

  const thinkStart = now();
  const selected = await selectBotMove(deps, fen, afterPly, bot);
  const elapsedSoFar = now() - thinkStart;
  if (elapsedSoFar < minThinkMs) await sleep(minThinkMs - elapsedSoFar);
  const botElapsedMs = now() - thinkStart;

  const botResult = await commitBotMove(deps, session.gameId, selected.san, { elapsedMs: botElapsedMs });
  if ('error' in botResult) {
    throw new BotSelectionError(`commitBotReply: bot selected an illegal move "${selected.san}" (${botResult.error})`);
  }
  const botMove: CommittedTurnMove = { ...botResult, elapsedMs: botElapsedMs };

  if (clock.isTimed) {
    const moverColor = botMove.ply % 2 === 1 ? 'white' : 'black';
    ({ whiteRemainingMs, blackRemainingMs } = applyClockTick(moverColor, botElapsedMs, clock.incrementMs, whiteRemainingMs, blackRemainingMs));
    await gamesRepo.updateRemainingMs(deps.db, session.gameId, { whiteRemainingMs, blackRemainingMs });
  }

  const gameOverAfterBot = gameOverInfo(gameOutcomeFromPgn((await requireGame(deps.db, session.gameId)).pgn));
  if (gameOverAfterBot) {
    await finalizeBotGame(deps, session, botMove.ply, gameOverAfterBot.result);
    return { bot: botMove, gameOver: gameOverAfterBot, whiteRemainingMs, blackRemainingMs };
  }

  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, botMove.ply);
  return { bot: botMove, gameOver: null, whiteRemainingMs, blackRemainingMs };
}

/**
 * The failover path: recovers a bot reply that never landed, whether because
 * commitBotTurn returned botPending or because the client never even saw
 * that response (a dropped connection). Called by the session page's own
 * "is it still the bot's move" poll (useBotTurnFailover) — safe to call any
 * time, including redundantly: if it's actually the student's move (the
 * reply already landed from an earlier attempt) or the game already ended,
 * this is a no-op error rather than a duplicate move.
 */
export async function requestBotMove(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  bot: BotConfig
): Promise<RequestBotMoveResult | { error: string }> {
  // Re-read rather than trusting the caller's `session` — this function
  // exists specifically to recover from a state where the client's view is
  // stale, so the whose-turn check has to run against the current row, not
  // whatever the route loaded before this call.
  const freshSession = await sessionsRepo.findById(deps.db, session.id);
  if (!freshSession) throw new NotFoundError('Session not found');
  if (freshSession.status !== 'active') return { error: 'Session is not active' };

  const game = await requireGame(deps.db, freshSession.gameId);
  if (moverToMoveNext(freshSession.currentPly) === game.userColor) {
    return { error: 'It is not the bot\'s turn to move' };
  }

  const now = deps.now ?? Date.now;
  const minThinkMs = deps.minThinkMs ?? MIN_BOT_THINK_MS;
  const clock: ClockState = {
    isTimed: game.clockInitialMs !== null,
    incrementMs: game.clockIncrementMs ?? 0,
    whiteRemainingMs: game.whiteRemainingMs,
    blackRemainingMs: game.blackRemainingMs
  };

  try {
    const reply = await commitBotReply(deps, freshSession, bot, freshSession.currentPly, currentFen(game.pgn), clock, now, minThinkMs);
    return { player: null, ...reply };
  } catch (error) {
    // See commitBotTurn's identical guard: a selection-logic bug should
    // surface, not loop forever as an indefinitely-retried botPending.
    if (error instanceof BotSelectionError) throw error;

    console.error(`requestBotMove: bot reply failed for session ${freshSession.id}, still botPending:`, error);
    return {
      player: null,
      bot: null,
      gameOver: null,
      whiteRemainingMs: clock.whiteRemainingMs,
      blackRemainingMs: clock.blackRemainingMs,
      botPending: true
    };
  }
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
