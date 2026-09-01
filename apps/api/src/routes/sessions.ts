import {
  CommitBotMoveResponseSchema,
  CommitPlayerMoveRequestSchema,
  CreateBotSessionRequestSchema,
  CreatePlaySessionRequestSchema,
  CreateSessionRequestSchema,
  findBotConfig,
  PostSessionMessageRequestSchema
} from '@freechesscoach/shared';
import { buildBotMoveChoiceMessages, type BotMoveChoiceInput } from '@freechesscoach/prompts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import * as sessionsRepo from '../db/repositories/sessions.js';
import type { Database } from '../db/schema.js';
import type { CoachAgentBaseDependencies } from '../bootstrap.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { callBotTiebreak } from '../llm/bot-tiebreak.js';
import { getModelForUser } from '../llm/gateway.js';
import { generateProse } from '../llm/text.js';
import { pipeCoachStreamToResponse } from '../llm/stream-response.js';
import * as coachAgent from '../services/coach-agent.js';
import { commitPlayerMoveAndAdvance } from '../services/play-move-commit.js';
import { createPlaySession } from '../services/play-session.js';
import { createBotSession } from '../services/bot/bot-session.js';
import { commitBotTurn, requestBotMove, type BotMoveCommitDependencies } from '../services/bot/bot-move-commit.js';
import { claimBotGameTimeout } from '../services/bot/bot-claim-timeout.js';
import { resignBotGame } from '../services/bot/bot-resign.js';
import { undoLastBotTurn } from '../services/bot/bot-undo.js';
import * as userProfileService from '../services/user-profile.js';
import type { CoachAgentDependencies } from '../services/coach-agent.js';
import {
  resolveEngineBackend,
  resolveRawEngineBackend,
  type ResolveEngineBackendOptions
} from '../services/engine/resolve-engine-backend.js';

export function registerSessionsRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  baseDeps: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions
): void {
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
    const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id);
    return createBotSession(botDeps, user.id, parsed.data.studentColor, bot, parsed.data.clock);
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
  // when the follow-up chat turn runs. No standalone undo route exists:
  // undo is only ever reached via the undo_last_move coach tool, mediated
  // by conversation ("the coach asks, the student agrees").
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

      const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id);
      const result = await commitBotTurn(botDeps, session, bot, parsed.data.san);
      if ('error' in result) return sendIllegalMoveError(reply, result.error);
      return CommitBotMoveResponseSchema.parse(result);
    }

    const agentDeps = await buildRequestScopedAgentDeps(baseDeps, engineBackendOptions, user.id);
    const result = await commitPlayerMoveAndAdvance(agentDeps, session, parsed.data.san);
    if ('error' in result) return sendIllegalMoveError(reply, result.error);
    return result;
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

    const botDeps = await buildBotMoveCommitDeps(baseDeps, engineBackendOptions, user.id);
    const result = await requestBotMove(botDeps, session, bot);
    if ('error' in result) return sendIllegalMoveError(reply, result.error);
    return CommitBotMoveResponseSchema.parse(result);
  });

  // play_bot's "Undo" button — no equivalent for 'play' mode, where undo is
  // only ever reached via the coach's own undo_last_move tool. See
  // bot-undo.ts's doc comment for why this removes two plies, not one.
  app.post<{ Params: { id: string } }>('/api/sessions/:id/undo-bot-move', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const session = await sessionsRepo.findByIdForUser(db, request.params.id, user.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.mode !== 'play_bot') throw new ConflictError('Session is not a play_bot session');
    if (session.status !== 'active') throw new ConflictError('Session is not active');

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

async function buildRequestScopedAgentDeps(
  base: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions,
  userId: string
): Promise<CoachAgentDependencies> {
  const backend = await resolveEngineBackend(engineBackendOptions, userId);
  const resolveModel = base.resolveModel ?? getModelForUser;
  const callLightModel = async (messages: { system: string; user: string }): Promise<string> => {
    const resolution = await resolveModel(base.db, base.gatewayConfig, userId, 'light');
    const result = await generateProse({ resolution, system: messages.system, prompt: messages.user });
    return result.text;
  };
  return { ...base, analyzePosition: (fen) => backend.analyzePosition(fen), callLightModel };
}

/** "Play vs Bot" plan: analyzePosition (cached, standard depth) grades move
 * quality exactly like play mode; analyzeBotPosition (uncached — see
 * resolveRawEngineBackend) is the bot's own shallow, level-dependent search
 * used to pick its move; callTiebreak wraps the light-tier LLM call, never
 * thrown, only ever invoked by the selector when aiEnabled and a candidate
 * cluster is genuinely close. */
async function buildBotMoveCommitDeps(
  base: CoachAgentBaseDependencies,
  engineBackendOptions: ResolveEngineBackendOptions,
  userId: string
): Promise<BotMoveCommitDependencies> {
  const cachedBackend = await resolveEngineBackend(engineBackendOptions, userId);
  const rawBackend = await resolveRawEngineBackend(engineBackendOptions, userId);

  return {
    db: base.db,
    jobQueue: base.jobQueue,
    analyzePosition: (fen) => cachedBackend.analyzePosition(fen),
    // 'interactive': a bot move is a live "your move" round trip the student
    // is watching, not background batch work — it must jump ahead of a
    // same-game deepen-analysis pass (or another user's import) queued on
    // the shared native engine pool. See EnginePrioritySchema's doc comment.
    analyzeBotPosition: (fen, opts) => rawBackend.analyzePosition(fen, { ...opts, priority: 'interactive' }),
    callTiebreak: (input: BotMoveChoiceInput) =>
      callBotTiebreak(base.db, base.gatewayConfig, userId, buildBotMoveChoiceMessages(input)),
    random: Math.random
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
