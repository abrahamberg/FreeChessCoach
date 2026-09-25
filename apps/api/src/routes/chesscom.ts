import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import * as gamesRepo from '../db/repositories/games.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import type { ChesscomClient } from '../services/chesscom.js';
import * as userProfileService from '../services/user-profile.js';

export function registerChesscomRoutes(
  app: FastifyInstance,
  db: Kysely<Database>,
  chesscomClient: ChesscomClient
): void {
  app.get<{ Querystring: { before?: string } }>('/api/chesscom/recent-games', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    if (!user.chesscomUsername) {
      throw new NotFoundError('No linked Chess.com username');
    }
    const before = request.query.before === undefined ? undefined : new Date(request.query.before);
    if (before && Number.isNaN(before.getTime())) throw new ValidationError('before must be an ISO timestamp');
    const games = await chesscomClient.fetchRecentGames(user.chesscomUsername, before);
    const imported = await gamesRepo.findImportedPgns(
      db,
      user.id,
      games.map((game) => game.pgn)
    );
    return games.map((game) => ({ ...game, imported: imported.has(game.pgn) }));
  });
}
