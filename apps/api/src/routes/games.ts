import { InvalidPgnError, parseAnnotatedPgn } from '@freechesscoach/chess-analysis';
import { ImportGameRequestSchema, PromoteGameRequestSchema } from '@freechesscoach/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Kysely } from 'kysely';
import * as analysesRepo from '../db/repositories/analyses.js';
import * as gamesRepo from '../db/repositories/games.js';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { pgnFilename } from '../lib/pgn-filename.js';
import { composeGameReport } from '../services/game-report.js';
import { importGame, MissingUserColorError, startAnalysis } from '../services/game-import.js';
import { deleteGameForUser, listGamesForUser, promoteGame } from '../services/games.js';
import { getGameTacticBaselineNote } from '../services/stats-dashboard.js';
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
    // its live move-quality plies instead — a distinctly-named field, not
    // overloaded onto classifiedMoves, so the frontend can tell the two
    // data sources apart. 0032_annotated_pgn.ts: both this and the batch
    // pipeline now read the same column (game.annotatedPgn), just via
    // different fields in the response for the frontend's benefit.
    if (game.source === 'coach_play') {
      const liveMoveQualities = movesFromAnnotatedPgn(game);
      return { ...game, analysisStatus: null, classifiedMoves: null, liveMoveQualities, gameReport: null };
    }

    // Play-vs-bot plan: a vs_bot game gets both worlds — live per-move quality
    // plies while the game is in progress (same as coach_play) AND, once the
    // deferred standard-depth post-game analysis job (queued by
    // commitBotTurn when the game ends) completes, a real Game Report —
    // unlike coach_play, which never gets one.
    if (game.source === 'vs_bot') {
      const liveMoveQualities = movesFromAnnotatedPgn(game);
      const botAnalysis = await analysesRepo.findByGameId(db, game.id);
      const storedBotReport = await analysesRepo.findGameReportByGameId(db, game.id);
      const botGameReport = storedBotReport ? composeGameReport(storedBotReport, game) : null;
      return {
        ...game,
        analysisStatus: botAnalysis?.status ?? null,
        classifiedMoves: null,
        liveMoveQualities,
        gameReport: botGameReport,
        // Same read-time derivation as the analyze branch below: a finished
        // bot game with a Game Report is reviewed through exactly the same
        // page, so leaving this out here would silently hide the baseline
        // note for every bot game.
        tacticBaseline: botGameReport
          ? await getGameTacticBaselineNote(db, user.id, game.id, botGameReport, game.userColor)
          : null
      };
    }

    const analysis = await analysesRepo.findByGameId(db, game.id);
    const storedReport = await analysesRepo.findGameReportByGameId(db, game.id);
    const gameReport = storedReport ? composeGameReport(storedReport, game) : null;
    // Sourced straight from annotatedPgn (like the two branches above), not
    // from gameReport.moves: the batch job writes annotatedPgn well before
    // the game report is ready (0032_annotated_pgn.ts), so classifiedMoves
    // stays available on its own timeline, same as before that migration.
    const classifiedMoves = game.annotatedPgn ? movesFromAnnotatedPgn(game) : null;
    return {
      ...game,
      analysisStatus: analysis?.status ?? null,
      classifiedMoves,
      liveMoveQualities: null,
      gameReport,
      // Derived at read time, not stored: what counts as "unusual for you"
      // depends on the games played since, so a note frozen into the report
      // would go stale the moment the next game is analysed.
      tacticBaseline: gameReport ? await getGameTacticBaselineNote(db, user.id, game.id, gameReport, game.userColor) : null
    };
  });

  // Plain-text download, not JSON — a same-origin browser navigation (an
  // <a href> or window.location assignment, both already carry the
  // session's oauth2-proxy cookie) triggers the browser's native save-file
  // flow via Content-Disposition rather than needing a fetch+blob dance.
  app.get<{ Params: { id: string } }>('/api/games/:id/pgn', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    const game = await gamesRepo.findByIdForUser(db, request.params.id, user.id);
    if (!game) throw new NotFoundError('Game not found');

    return reply
      .code(200)
      .type('application/x-chess-pgn; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${pgnFilename(game)}"`)
      .send(game.pgn);
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

  // Games page "move up the stack" action (design: coach/review/bot-games/
  // imported-games tabs) — see promoteGame for the transition rules.
  app.post<{ Params: { id: string } }>('/api/games/:id/promote', async (request) => {
    const parsed = PromoteGameRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    const reviewTier = await promoteGame(db, user.id, request.params.id, parsed.data.tier);
    return { reviewTier };
  });

  app.delete<{ Params: { id: string } }>('/api/games/:id', async (request, reply) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    await deleteGameForUser(db, request.params.id, user.id);
    return reply.code(204).send();
  });
}

/** A play-mode game's live per-move quality — 0032_annotated_pgn.ts: reads
 * the same `annotatedPgn` column the batch pipeline's `classifiedMoves`
 * does, just null-guarded for a fresh game with no moves committed yet. */
function movesFromAnnotatedPgn(game: { annotatedPgn: string | null; userColor: 'white' | 'black' }) {
  return game.annotatedPgn ? parseAnnotatedPgn(game.annotatedPgn, game.userColor) : [];
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
