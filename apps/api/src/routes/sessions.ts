import {
  BotThinkingLogEnabledRequestSchema,
  BotThinkingLogEnabledResponseSchema,
  BotThinkingLogSchema,
  CommitBotMoveResponseSchema,
  CommitPlayerMoveRequestSchema,
  CreateBotSessionRequestSchema,
  CreatePlaySessionRequestSchema,
  CreateSessionRequestSchema,
  findBotConfig,
  PostSessionMessageRequestSchema
} from '@freechesscoach/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import { parsePositiveInt, type CoachAgentBaseDependencies } from '../bootstrap.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { getModelForUser } from '../llm/gateway.js';
import { generateProse } from '../llm/text.js';
import { pipeCoachStreamToResponse } from '../llm/stream-response.js';
import * as coachAgent from '../services/coach-agent.js';
import { commitPlayerMoveAndAdvance } from '../services/play-move-commit.js';
import { createPlaySession } from '../services/play-session.js';
import { createBotSession } from '../services/bot/bot-session.js';
import { commitBotTurn, requestBotMove, type BotMoveCommitDependencies } from '../services/bot/bot-move-commit.js';
import type { RatingEvalStore } from '../services/bot/bot-rating-evals.js';
import { lightEngineCooldownFor, verifyWithLightFirst } from '../services/bot/bot-verify.js';
import { createLiteAnalyzer } from '../services/engine/lite-supplemented-engine-backend.js';
import { botThinkingRegistry, type BotThinkingRegistry } from '../services/bot/bot-thinking-registry.js';
import { claimBotGameTimeout } from '../services/bot/bot-claim-timeout.js';
import { resignBotGame } from '../services/bot/bot-resign.js';
import { undoLastBotTurn } from '../services/bot/bot-undo.js';
import * as userProfileService from '../services/user-profile.js';
import type { CoachAgentDependencies } from '../services/coach-agent.js';
import {
  resolveEngineBackend,
  resolveRawEngineBackend,
  DEFAULT_BOT_SEARCH_TIMEOUT_MS,
  withBotSearchTimeout,
  type ResolveEngineBackendOptions
} from '../services/engine/resolve-engine-backend.js';

/** State a bot game keeps outside the process, shared by every API pod (see
 * bootstrap.ts). Both default to process-local behaviour when omitted. */
export interface SharedBotState {
  ratingEvals?: RatingEvalStore;
  thinkingLog?: BotThinkingRegistry;
}

export function registerSessionsRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  baseDeps: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions,
  shared: SharedBotState = {}
): void {
  const { ratingEvals, thinkingLog = botThinkingRegistry } = shared;
  app.post('/api/sessions', async (request) => {
    const parsed = CreateSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    const game = await gamesRepo.findByIdForUser(db, parsed.data.gameId, user.id);
    if (!game) throw new NotFoundError('Game not found');

    const analysis = await analysesRepo.findByGameId(db, game.id);
    if (!analysis || analysis.status !== 'ready') {
      throw new ConflictError('Analysis is not ready yet');
    }

    return coachAgent.resumeOrCreateSession(db, user.id, game.id);
  });

  // architecture §14: no analysis gate — a play-mode game has no
  // pre-session analysis pipeline to wait on.
  app.post('/api/sessions/play', async (request) => {
    const parsed = CreatePlaySessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    return createPlaySession(db, user.id, parsed.data.studentColor);
  });

  // "Play vs Bot" plan: same no-gate shape as /api/sessions/play — a
  // preset-bot game has no pre-session analysis pipeline to wait on either.
  app.post('/api/sessions/play-bot', async (request) => {
    const parsed = CreateBotSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const bot = findBotConfig(parsed.data.botId);
    if (!bot) throw new NotFoundError(`Unknown bot "${parsed.data.botId}"`);

    const user = await userProfileService.getOrCreate(db, request.user);
    // Only actually used when studentColor is 'black' (the bot's forced
    // opening move as White) — built unconditionally anyway since it's cheap
    // until a search is actually run.
    const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id, { ratingEvals, thinkingLog });
    return createBotSession(botDeps, user.id, parsed.data.studentColor, bot, parsed.data.clock, parsed.data.rated === true);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const detail = await coachAgent.getSessionDetail(db, request.params.id, user.id);
    if (!detail) throw new NotFoundError('Session not found');
    return detail;
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/reset', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return coachAgent.resetSession(db, user.id, request.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/sessions/:id/messages', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');

    const parsed = PostSessionMessageRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const agentDeps = await buildRequestScopedAgentDeps(baseDeps, engineBackendOptions, user.id);
    const turn = await coachAgent.startTurn(agentDeps, session, parsed.data);

    reply.hijack();
    void pipeCoachStreamToResponse(reply.raw, turn);
  });

  // architecture §14: plain JSON, not the SSE chat endpoint above — the
  // frontend needs the confirmed fen immediately, independent of whether/
  // when the follow-up chat turn runs. 'play' mode also still has the
  // undo_last_move coach tool (the coach can offer to take a move back
  // mid-conversation) alongside the student-initiated /undo-move route
  // below — two paths to the same underlying play-moves.ts undo, one
  // coach-mediated, one self-serve.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/play-move', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play' && session.mode !== 'play_bot') {
      throw new ConflictError('Session is not a play-mode or play_bot-mode session');
    }
    if (session.status !== 'active') throw new ConflictError('Session is not active');

    const parsed = CommitPlayerMoveRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    if (session.mode === 'play_bot') {
      const game = await gamesRepo.findById(db, session.gameId);
      const bot = game?.botConfigSnapshot;
      if (!bot) throw new NotFoundError('Bot game is missing its bot configuration');

      const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id, { ratingEvals, thinkingLog });
      const result = await commitBotTurn(botDeps, session, bot, parsed.data.san);
      if ('error' in result) return sendIllegalMoveError(reply, result.error);
      return CommitBotMoveResponseSchema.parse(game?.rated === true ? withoutMoveFeedback(result) : result);
    }

    const agentDeps = await buildRequestScopedAgentDeps(baseDeps, engineBackendOptions, user.id);
    const result = await commitPlayerMoveAndAdvance(agentDeps, session, parsed.data.san);
    if ('error' in result) return sendIllegalMoveError(reply, result.error);
    return result;
  });

  // Live Thinking log for a bot game (bot-thinking-registry.ts): what the bot
  // is doing right now and what it did for earlier moves, with real start/end
  // times. Polled by the bot status panel while the bot is thinking. Opt-in
  // (see the route below): while the session's flag is off, nothing is
  // recorded anywhere, so an empty log is served rather than whatever a
  // previous enabled stretch may have left in this pod's memory.
  app.get<{ Params: { id: string } }>('/api/sessions/:id/bot-thinking', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');
    if (!session.botThinkingLog) return BotThinkingLogSchema.parse({ moves: [] });
    return BotThinkingLogSchema.parse(await thinkingLog.readLog(session.id));
  });

  // The Thinking log's opt-in switch (0043_bot_thinking_log.ts) — the bot
  // session page's header overflow menu is its only caller. While off, the
  // commit paths never start a trace (bot-move-commit.ts), so the default
  // bot game does no Thinking-log work at all; enabling it takes effect from
  // the next move on (nothing is recorded retroactively).
  app.post<{ Params: { id: string } }>('/api/sessions/:id/bot-thinking-log', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');

    const parsed = BotThinkingLogEnabledRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    if (parsed.data.enabled && (await gamesRepo.findById(db, session.gameId))?.rated === true) {
      throw new ConflictError('The thinking log is not available in a rated game');
    }

    await sessionsRepo.setBotThinkingLog(db, session.id, parsed.data.enabled);
    return BotThinkingLogEnabledResponseSchema.parse({ enabled: parsed.data.enabled });
  });

  // Failover for a bot reply that never landed (commitBotTurn's botPending,
  // or a dropped connection that ate a response that did succeed server-
  // side) — see useBotTurnFailover, which polls this while it's the bot's
  // turn and no move has shown up. No request body: there is nothing new to
  // submit, only the existing position to react to.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/request-bot-move', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');
    // Deliberately no `session.status !== 'active'` check here (unlike the
    // other play_bot routes below): this endpoint exists specifically to be
    // polled by a client racing the game's own end (useBotTurnFailover keeps
    // polling until it observes the game is over). requestBotMove re-reads
    // the session itself and reports "not active" as the same 422 no-op
    // every other already-resolved race gets — throwing a 409 here instead,
    // whenever this route's own read happens to land after the game ended,
    // would make an expected race look like two different errors depending
    // on timing.

    const game = await gamesRepo.findById(db, session.gameId);
    const bot = game?.botConfigSnapshot;
    if (!bot) throw new NotFoundError('Bot game is missing its bot configuration');

    const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id, { ratingEvals, thinkingLog });
    const result = await requestBotMove(botDeps, session, bot);
    if ('error' in result) return sendIllegalMoveError(reply, result.error);
    return CommitBotMoveResponseSchema.parse(game?.rated === true ? withoutMoveFeedback(result) : result);
  });

  // The student-initiated "Undo" button (BoardActionBar) for both live
  // sparring modes — play_bot originally, now also 'play' (undoLastBotTurn
  // isn't actually bot-specific: it pops the opponent's reply, bot or
  // coach, if it already landed, then the student's own move — see its own
  // doc comment for why that's two plies, not one). 'play' mode's
  // undo_last_move coach tool still exists alongside this — this route is
  // just the student-initiated path, not a replacement for it.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/undo-move', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play' && session.mode !== 'play_bot') {
      throw new ConflictError('Session is not a play-mode or play_bot-mode session');
    }
    if (session.status !== 'active') throw new ConflictError('Session is not active');
    if ((await gamesRepo.findById(db, session.gameId))?.rated === true) {
      throw new ConflictError('A rated game cannot be taken back');
    }

    const agentDeps = await buildRequestScopedAgentDeps(baseDeps, engineBackendOptions, user.id);
    const result = await undoLastBotTurn(agentDeps, session);
    if ('error' in result) return sendIllegalMoveError(reply, result.error);
    return result;
  });

  // play_bot's "flag" button — see bot-resign.ts.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/resign', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');
    if (session.status !== 'active') throw new ConflictError('Session is not active');

    const game = await gamesRepo.findById(db, session.gameId);
    if (!game) throw new NotFoundError('Game not found');

    return resignBotGame({ db, jobQueue: baseDeps.jobQueue }, session, game);
  });

  // The clock display's own "hit 0" trigger — see bot-claim-timeout.ts for
  // why the server re-verifies rather than trusting the client. A session
  // that's no longer active (already ended some other way) is a no-op, not
  // an error — the client's timer can race a move that just ended the game.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/claim-timeout', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');
    if (session.status !== 'active') return { gameOver: null };

    const game = await gamesRepo.findById(db, session.gameId);
    if (!game) throw new NotFoundError('Game not found');

    return claimBotGameTimeout({ db, jobQueue: baseDeps.jobQueue }, session, game);
  });

  app.get<{ Params: { id: string } }>('/api/sessions/:id/debug/last-turn', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');

    const snapshot = await coachAgent.getLastTurnDebugSnapshot(db, session.id);
    if (!snapshot) throw new NotFoundError('No completed turn to debug yet');
    return snapshot;
  });
}

/** The light-tier subagent call, bound to `userId` — BYOK is the only LLM
 * path, so this resolves the specific user's own key rather than a shared
 * platform-level model (see CoachAgentDependencies.callLightModel's doc
 * comment). Shared by buildRequestScopedAgentDeps and
 * buildBotMoveCommitDeps, the two request-scoped dependency builders that
 * both need it. */
function buildCallLightModel(
  base: CoachAgentBaseDependencies,
  userId: string
): (messages: { system: string; user: string }) => Promise<string> {
  const resolveModel = base.resolveModel ?? getModelForUser;
  return async (messages) => {
    const resolution = await resolveModel(base.db, base.gatewayConfig, userId, 'light');
    const result = await generateProse({ resolution, system: messages.system, prompt: messages.user });
    return result.text;
  };
}

async function buildRequestScopedAgentDeps(
  base: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions,
  userId: string
): Promise<CoachAgentDependencies> {
  const backend = await resolveEngineBackend(engineBackendOptions, userId);
  return { ...base, analyzePosition: (fen) => backend.analyzePosition(fen), callLightModel: buildCallLightModel(base, userId) };
}

/** "Play vs Bot" plan: analyzePosition (cached, standard depth) grades move
 * quality exactly like play mode; analyzeBotPosition (uncached — see
 * resolveRawEngineBackend) is the bot's own phase-resolved, level-dependent
 * search used to pick its move (see bot-move-selector.ts's selectBotMove and
 * docs/plan.md's Phase 60 for the probability-roll model built on top of
 * this search). */
async function buildBotMoveCommitDeps(
  base: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions,
  userId: string,
  { ratingEvals, thinkingLog }: Required<Pick<SharedBotState, 'thinkingLog'>> & SharedBotState
): Promise<BotMoveCommitDependencies> {
  const cachedBackend = await resolveEngineBackend(engineBackendOptions, userId);
  const rawBackend = await resolveRawEngineBackend(
    withBotSearchTimeout(engineBackendOptions, parsePositiveInt('BOT_SEARCH_TIMEOUT_MS', DEFAULT_BOT_SEARCH_TIMEOUT_MS)),
    userId,
    { supplementBreadth: false }
  );

  const analyzeLight = createLiteAnalyzer(engineBackendOptions.tunnelTransport, userId, engineBackendOptions.tunnelTimeoutMs);

  return {
    db: base.db,
    jobQueue: base.jobQueue,
    callLightModel: buildCallLightModel(base, userId),
    analyzePosition: (fen) => cachedBackend.analyzePosition(fen),
    // 'interactive': a bot move is a live "your move" round trip the student
    // is watching, not background batch work — it must jump ahead of this
    // game's own re-analysis (or another user's import) queued on the
    // shared native engine pool. See EnginePrioritySchema's doc comment.
    analyzeBotPosition: (fen, opts) => rawBackend.analyzePosition(fen, { ...opts, priority: 'interactive' }),
    random: Math.random,
    thinkingLog,
    // Live labels for the student's moves come from the light engine, in the
    // background, never from the real pipeline that picks the bot's move.
    ratingEvals,
    analyzeLight,
    // Checking that a mistake really is one: the light engine when a tab is
    // connected, otherwise a small search on the bot's own engine.
    verifyBotPosition: verifyWithLightFirst(
      analyzeLight,
      (fen) => rawBackend.analyzePosition(fen, { depth: 12, multiPv: 1, movetimeMs: 1500, priority: 'interactive' }),
      { cooldown: lightEngineCooldownFor(userId) }
    )
  };
}

/** Same application/problem+json 422 shape games.ts's handleImportError uses
 * for a syntactically-valid request that fails a chess-domain rule. */
function sendIllegalMoveError(reply: FastifyReply, message: string): FastifyReply {
  return reply.code(422).type('application/problem+json').send({
    type: 'about:blank',
    title: message,
    status: 422
  });
}

/** A rated game gives no feedback on moves while it is played: the ratings
 * are still computed and saved (post-game analysis and pattern tracking use
 * them), just never sent to the student. */
function withoutMoveFeedback<T extends { player: { quality: unknown } | null; bot: { quality: unknown } | null }>(result: T): T {
  return {
    ...result,
    player: result.player && { ...result.player, quality: null },
    bot: result.bot && { ...result.bot, quality: null }
  };
}
