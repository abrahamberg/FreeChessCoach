import type { Kysely } from 'kysely';
import { botThinkTimeMs, gameOutcomeFromPgn, lastMoveOf, lastMoveOfPgn, type GameOutcome, type LastMove } from '@freechesscoach/chess-analysis';
import type { BotConfig, MoveQuality } from '@freechesscoach/shared';
import * as gamesRepo from '../../db/repositories/games.js';
import type { GameRow } from '../../db/repositories/games.js';
import * as sessionMessagesRepo from '../../db/repositories/session-messages.js';
import * as sessionsRepo from '../../db/repositories/sessions.js';
import type { SessionRow } from '../../db/repositories/sessions.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';
import type { JobQueue } from '../../jobs/queue.js';
import { currentEpisode } from '../../lib/episodes.js';
import { closeEpisodeIfNeeded, type CoachContextDependencies } from '../coach-context.js';
import { commitMoveUnrated } from '../play-moves-rated.js';
import { currentFen, type PlayMovesDependencies } from '../play-moves.js';
import { moverToMoveNext } from './bot-claim-timeout.js';
import { finalizeBotGame } from './bot-finalize.js';
import { BotSelectionError, selectBotMove, type BotMoveSelectorDependencies, type SelectedBotMove } from './bot-move-selector.js';
import { runTraced, type BotMoveTrace } from './bot-move-trace.js';
import type { BotThinkingRegistry } from './bot-thinking-registry.js';
import { scheduleRatingEval, type RatingEvalDependencies } from './bot-rating-evals.js';
import { playerMoveToRate, ratePlayerMove, rateBotMove, type PlayerMoveToRate, type RatingContext } from './bot-turn-rating.js';

export interface BotMoveCommitDependencies extends PlayMovesDependencies, BotMoveSelectorDependencies, CoachContextDependencies, RatingEvalDependencies {
  jobQueue: JobQueue;
  now?: () => number;
  /** Fixes the bot's think time instead of simulating a person's
   * (`botThinkTimeMs`) — tests set it to 0 to avoid real delays. */
  minThinkMs?: number;
  /** Where each bot move's live Thinking log is kept (see
   * bot-thinking-registry.ts) — omitted, nothing is recorded. */
  thinkingLog?: BotThinkingRegistry;
}

export interface CommittedTurnMove {
  fen: string;
  san: string;
  ply: number;
  /** Null when the move could not be rated in time (see bot-turn-rating.ts) —
   * post-game analysis rates every move regardless. */
  quality: MoveQuality | null;
  elapsedMs: number;
}

export interface CommitBotTurnResult {
  player: CommittedTurnMove;
  bot: CommittedTurnMove | null;
  gameOver: { result: '1-0' | '0-1' | '1/2-1/2'; reason: string } | null;
  /** Post-move remaining time for each side — null/null for an untimed game
   * (games.clockInitialMs === null). The mover's own think time (including,
   * for the bot, its simulated think time) is deducted and any
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
  initialMs: number;
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
  // Opt-in (0043_bot_thinking_log.ts): off, no trace exists at all — no
  // registry entry, no mirror writes, nothing for the GET route to serve.
  const trace = session.botThinkingLog ? deps.thinkingLog?.start(session.id, { source: 'turn', ply: null }) : undefined;
  try {
    return await commitBotTurnTraced(deps, session, bot, playerSan, trace);
  } catch (error) {
    trace?.fail(describeError(error));
    throw error;
  }
}

async function commitBotTurnTraced(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  bot: BotConfig,
  playerSan: string,
  trace: BotMoveTrace | undefined
): Promise<CommitBotTurnResult | { error: string }> {
  const now = deps.now ?? Date.now;
  const minThinkMs = deps.minThinkMs;

  const gameBefore = await requireGame(deps.db, session.gameId);
  const clock: ClockState = {
    isTimed: gameBefore.clockInitialMs !== null,
    initialMs: gameBefore.clockInitialMs ?? 0,
    incrementMs: gameBefore.clockIncrementMs ?? 0,
    whiteRemainingMs: gameBefore.whiteRemainingMs,
    blackRemainingMs: gameBefore.blackRemainingMs
  };

  // gameBefore.lastMoveAt (0032_annotated_pgn.ts) replaces a second query
  // for game_move_qualities' latest row — same "previous move's timestamp,
  // or session start for the very first move" fallback.
  const previousTimestamp = gameBefore.lastMoveAt ?? session.startedAt;
  const playerElapsedMs = now() - previousTimestamp.getTime();

  const playerResult = await runTraced(
    trace,
    'Saving your move',
    () => commitMoveUnrated(deps.db, session.gameId, playerSan, { elapsedMs: playerElapsedMs }),
    { describeResult: (result) => ('error' in result ? `rejected: ${result.error}` : 'saved') }
  );
  if ('error' in playerResult) {
    discardTrace(deps, session, trace);
    return playerResult;
  }
  trace?.setPly(playerResult.ply + 1);
  const player: CommittedTurnMove = {
    fen: playerResult.fen,
    san: playerResult.san,
    ply: playerResult.ply,
    quality: null,
    elapsedMs: playerElapsedMs
  };

  if (clock.isTimed) {
    const moverColor = player.ply % 2 === 1 ? 'white' : 'black';
    const ticked = applyClockTick(moverColor, playerElapsedMs, clock.incrementMs, clock.whiteRemainingMs, clock.blackRemainingMs);
    clock.whiteRemainingMs = ticked.whiteRemainingMs;
    clock.blackRemainingMs = ticked.blackRemainingMs;
    await gamesRepo.updateRemainingMs(deps.db, session.gameId, ticked);
  }

  // Fold whatever the student and coach discussed about the position they
  // just moved from into session_move_notes before the ply pointer leaves
  // it — the same closeEpisodeIfNeeded-then-advance pairing every other
  // ply-advancing path in the app uses (coach-agent-turn.ts's position
  // jumps and play-mode moves, coach-agent-client-tool-result.ts's
  // show_position, play-move-commit.ts's own play-mode equivalent of this
  // function). Without it, that discussion's raw messages stay tagged at
  // the old ply forever — invisible to the next episode's scan AND never
  // folded into a note, so the coach starts the next position with no
  // memory of what was just said. A no-op today (play_bot mode has no live
  // chat yet, so there is nothing pending at this ply — see
  // closeEpisodeIfNeeded's own early return), but required once it does.
  const historyBeforePlayerMove = await sessionMessagesRepo.listBySession(deps.db, session.id);
  const closedPlayerEpisode = currentEpisode(historyBeforePlayerMove, session.subjectPly);
  await closeEpisodeIfNeeded(deps, session.id, closedPlayerEpisode.messages, session.subjectPly);
  await sessionsRepo.updateSubjectAndCurrentPly(deps.db, session.id, player.ply);

  const gameOverAfterPlayer = gameOverInfo(gameOutcomeFromPgn((await requireGame(deps.db, session.gameId)).pgn));
  if (gameOverAfterPlayer) {
    discardTrace(deps, session, trace);
    await finalizeBotGame(deps, session, player.ply, gameOverAfterPlayer.result);
    return { player, bot: null, gameOver: gameOverAfterPlayer, whiteRemainingMs: clock.whiteRemainingMs, blackRemainingMs: clock.blackRemainingMs };
  }

  const playerToRate = playerMoveToRate(playerResult);

  try {
    const { playerQuality, ...reply } = await commitBotReply(deps, session, bot, player.ply, player.fen, clock, now, minThinkMs, lastMoveOf(playerResult.fenBefore, playerResult.san), trace, playerToRate);
    trace?.complete();
    return { player: { ...player, quality: playerQuality }, ...reply };
  } catch (error) {
    trace?.fail(describeError(error));
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
  minThinkMs: number | undefined,
  lastMove: LastMove | null,
  trace?: BotMoveTrace,
  playerToRate?: PlayerMoveToRate
): Promise<BotReplyResult & { playerQuality: MoveQuality | null }> {
  const rating = ratingContext(deps, session.gameId);
  const thinkStart = now();
  const selected = await selectBotMove(deps, fen, afterPly, bot, trace, lastMove);

  // The student's move is rated from the search that just finished (plus the
  // eval already in flight). It must finish BEFORE the bot's move is saved:
  // rating edits the game's last move. It is awaited before the think time
  // is worked out too, since how good the student's move was is one input.
  const playerQuality = playerToRate
    ? await runTraced(trace, 'Rating your move', () => ratePlayerMove(rating, playerToRate, selected))
    : null;
  const targetMs = minThinkMs ?? simulatedThinkMs(deps, afterPly, fen, clock, selected, playerQuality);
  const elapsedSoFar = now() - thinkStart;
  if (elapsedSoFar < targetMs) {
    const paddingMs = targetMs - elapsedSoFar;
    await runTraced(trace, 'Thinking like a person at the clock', () => sleep(paddingMs), { detail: `${paddingMs}ms (aim ${targetMs}ms)` });
  }
  const botElapsedMs = now() - thinkStart;

  const botResult = await runTraced(
    trace,
    "Saving the bot's move",
    () => commitMoveUnrated(deps.db, session.gameId, selected.san, { elapsedMs: botElapsedMs, ...(selected.evalAfter ? { evalAfter: selected.evalAfter } : {}) }),
    { describeResult: (result) => ('error' in result ? `rejected: ${result.error}` : `saved ${selected.san}`) }
  );
  if ('error' in botResult) {
    throw new BotSelectionError(`commitBotReply: bot selected an illegal move "${selected.san}" (${botResult.error})`);
  }
  const botQuality = await runTraced(trace, "Rating the bot's move", () => rateBotMove(rating, botResult, selected));
  const botMove: CommittedTurnMove = {
    fen: botResult.fen,
    san: botResult.san,
    ply: botResult.ply,
    quality: botQuality,
    elapsedMs: botElapsedMs
  };

  const finished = await runTraced(trace, 'Finishing up (clock, game state, session position)', () =>
    finishBotReply(deps, session, botMove, afterPly, clock)
  );
  // The student is about to move from here: get the light engine's eval of it
  // ready for rating that move, without holding this reply for it.
  if (!finished.gameOver) scheduleRatingEval(deps, botMove.fen);
  return { ...finished, playerQuality };
}

/** How long a person in the bot's seat would take over this move — see
 * `botThinkTimeMs`. The bot moves at ply `afterPly + 1`, so it is White when
 * an even number of halfmoves have been played. */
function simulatedThinkMs(
  deps: BotMoveCommitDependencies,
  afterPly: number,
  fen: string,
  clock: ClockState,
  selected: SelectedBotMove,
  playerQuality: MoveQuality | null
): number {
  const botRemainingMs = afterPly % 2 === 0 ? clock.whiteRemainingMs : clock.blackRemainingMs;
  return botThinkTimeMs({
    fen,
    plyCount: afterPly,
    usedBook: selected.usedBook,
    analysis: selected.analysis,
    playerQuality,
    clock: clock.isTimed && botRemainingMs !== null ? { initialMs: clock.initialMs, incrementMs: clock.incrementMs, remainingMs: botRemainingMs } : null,
    random: deps.random
  });
}

function ratingContext(deps: BotMoveCommitDependencies, gameId: string): RatingContext {
  return { deps, gameId };
}

interface BotReplyResult {
  bot: CommittedTurnMove;
  gameOver: CommitBotTurnResult['gameOver'];
  whiteRemainingMs: number | null;
  blackRemainingMs: number | null;
}

/** Everything after the bot's move is committed: tick the clock, detect the
 * end of the game, and advance the session's ply pointer. */
async function finishBotReply(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  botMove: CommittedTurnMove,
  afterPly: number,
  clock: ClockState
): Promise<BotReplyResult> {
  let { whiteRemainingMs, blackRemainingMs } = clock;
  const botElapsedMs = botMove.elapsedMs;

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

  // Same pairing as commitBotTurn's own player-move advance above: fold
  // anything discussed about `afterPly` (the position the bot is replying
  // to) before the pointer moves past it. A no-op today for the same
  // reason (no live play_bot chat yet).
  const historyBeforeBotMove = await sessionMessagesRepo.listBySession(deps.db, session.id);
  const closedBotEpisode = currentEpisode(historyBeforeBotMove, afterPly);
  await closeEpisodeIfNeeded(deps, session.id, closedBotEpisode.messages, afterPly);
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
  let trace: BotMoveTrace | undefined;
  try {
    return await requestBotMoveTraced(deps, session, bot, (freshSession) => {
      // Same opt-in gate as commitBotTurn's — see it there.
      trace = freshSession.botThinkingLog
        ? deps.thinkingLog?.start(freshSession.id, { source: 'failover', ply: freshSession.currentPly + 1 })
        : undefined;
      return trace;
    });
  } catch (error) {
    trace?.fail(describeError(error));
    throw error;
  }
}

async function requestBotMoveTraced(
  deps: BotMoveCommitDependencies,
  session: SessionRow,
  bot: BotConfig,
  startTrace: (freshSession: SessionRow) => BotMoveTrace | undefined
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

  // Started only now, after the "is it really the bot's turn" checks above:
  // a no-op poll must not leave an empty move in the Thinking log.
  const trace = startTrace(freshSession);
  const now = deps.now ?? Date.now;
  const minThinkMs = deps.minThinkMs;
  const clock: ClockState = {
    isTimed: game.clockInitialMs !== null,
    initialMs: game.clockInitialMs ?? 0,
    incrementMs: game.clockIncrementMs ?? 0,
    whiteRemainingMs: game.whiteRemainingMs,
    blackRemainingMs: game.blackRemainingMs
  };

  try {
    const { playerQuality: _noStudentMoveThisTime, ...reply } = await commitBotReply(
      deps,
      freshSession,
      bot,
      freshSession.currentPly,
      currentFen(game.pgn),
      clock,
      now,
      minThinkMs,
      lastMoveOfPgn(game.pgn),
      trace
    );
    trace?.complete();
    return { player: null, ...reply };
  } catch (error) {
    trace?.fail(describeError(error));
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

/** A trace for a turn that turned out not to involve the bot at all (the
 * student's move was rejected, or it ended the game) is dropped rather than
 * left in the Thinking log as a move that never happened. */
function discardTrace(deps: BotMoveCommitDependencies, session: SessionRow, trace: BotMoveTrace | undefined): void {
  if (trace) deps.thinkingLog?.discard(session.id, trace);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
