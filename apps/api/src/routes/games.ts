import { InvalidPgnError } from '@freechesscoach/chess-analysis';
import { ImportGameRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gameMoveQualitiesRepo from '../db/repositories/game-move-qualities.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { importGame, MissingUserColorError, startAnalysis } from '../services/game-import.js';
import { deleteGameForUser, listGamesForUser } from '../services/games.js';
import * as userProfileService from '../services/user-profile.js';

export function registerGamesRoutes(app: FastifyInstance, db: Kysely<Database>, jobQueue: JobQueue): void {
  app.post('/api/games', async (request, reply) => {
    const parsed = ImportGameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    const usernames = {
      lichess: user.lichessUsername ?? undefined,
      chesscom: user.chesscomUsername ?? undefined,
      displayName: user.displayName
    };

    try {
      return await importGame(db, jobQueue, user.id, usernames, parsed.data);
    } catch (error) {
      return handleImportError(reply, error);
    }
  });

  app.get('/api/games', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    return listGamesForUser(db, user.id);
  });

  app.get<{ Params: { id: string } }>('/api/games/:id', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const game = await gamesRepo.findByIdForUser(db, request.params.id, user.id);
    if (!game) throw new NotFoundError('Game not found');

    // architecture §14: a play-mode game never gets an `analyses` row (no
    // pre-game batch pipeline), so it skips that lookup entirely and returns
    // its live move-quality rows instead — a distinctly-named field, not
    // overloaded onto classifiedMoves, so the frontend can tell the two
    // data sources apart.
    if (game.source === 'coach_play') {
      const liveMoveQualities = await gameMoveQualitiesRepo.listByGameId(db, game.id);
      return { ...game, analysisStatus: null, classifiedMoves: null, liveMoveQualities, gameReport: null };
    }

    // Play-vs-bot plan: a vs_bot game gets both worlds — live per-move quality
    // rows while the game is in progress (same as coach_play) AND, once the
    // deferred standard-depth post-game analysis job (queued by
    // commitBotTurn when the game ends) completes, a real Game Report —
    // unlike coach_play, which never gets one.
    if (game.source === 'vs_bot') {
      const liveMoveQualities = await gameMoveQualitiesRepo.listByGameId(db, game.id);
      const botAnalysis = await analysesRepo.findByGameId(db, game.id);
      const botGameReport = await analysesRepo.findGameReportByGameId(db, game.id);
      return {
        ...game,
        analysisStatus: botAnalysis?.status ?? null,
        classifiedMoves: null,
        liveMoveQualities,
        gameReport: botGameReport ?? null
      };
    }

    const analysis = await analysesRepo.findByGameId(db, game.id);
    const classifiedMoves = await analysesRepo.findClassifiedMovesByGameId(db, game.id);
    const gameReport = await analysesRepo.findGameReportByGameId(db, game.id);
    return {
      ...game,
      analysisStatus: analysis?.status ?? null,
      classifiedMoves: classifiedMoves ?? null,
      liveMoveQualities: null,
      gameReport: gameReport ?? null
    };
  });

  // Stat-bank import (Phase 31): starts analysis for a game that was
  // imported with deferAnalysis — idempotent (a double-click or a race with
  // another tab just returns the existing analysisId rather than queuing a
  // second one) since insertQueued has no unique constraint of its own to
  // lean on here.
  app.post<{ Params: { id: string } }>('/api/games/:id/analyze', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const game = await gamesRepo.findByIdForUser(db, request.params.id, user.id);
    if (!game) throw new NotFoundError('Game not found');

    const existing = await analysesRepo.findByGameId(db, game.id);
    if (existing) return { analysisId: existing.id };

    return startAnalysis(db, jobQueue, game.id);
  });

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    await deleteGameForUser(db, request.params.id, user.id);
    return reply.code(204).send();
  });
}

function handleImportError(reply: FastifyReply, error: unknown): FastifyReply | never {
  if (error instanceof InvalidPgnError) throw new ValidationError(error.message);
  if (error instanceof MissingUserColorError) {
    return reply.code(422).type('application/problem+json').send({
      type: 'about:blank',
      title: error.message,
      status: 422,
      missing: 'userColor'
    });
  }
  throw error;
}
