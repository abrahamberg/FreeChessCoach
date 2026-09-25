import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import * as gamesRepo from '../db/repositories/games.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { LichessClient } from '../services/lichess.js';
import * as userProfileService from '../services/user-profile.js';
import { ROUTE_RATE_LIMITS, rateLimitConfig } from '../plugins/route-rate-limit.js';

export function registerLichessRoutes(app: FastifyInstance, db: Kysely<Database>, lichessClient: LichessClient): void {
  app.get<{ Querystring: { before?: string } }>('/api/lichess/recent-games', rateLimitConfig(ROUTE_RATE_LIMITS.remoteGameList), async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    if (!user.lichessUsername) {
      throw new NotFoundError('No linked Lichess username');
    }
    const before = request.query.before === undefined ? undefined : new Date(request.query.before);
    if (before && Number.isNaN(before.getTime())) throw new ValidationError('before must be an ISO timestamp');
    const games = await lichessClient.fetchRecentGames(user.lichessUsername, before);
    const imported = await gamesRepo.findImportedPgns(
      db,
      user.id,
      games.map((game) => game.pgn)
    );
    return games.map((game) => ({ ...game, imported: imported.has(game.pgn) }));
  });
}
