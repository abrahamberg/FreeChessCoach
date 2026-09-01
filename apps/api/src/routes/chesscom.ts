import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { NotFoundError } from '../lib/errors.js';
import type { ChesscomClient } from '../services/chesscom.js';
import * as userProfileService from '../services/user-profile.js';

export function registerChesscomRoutes(app: FastifyInstance, db: Kysely<Database>, chesscomClient: ChesscomClient): void {
  app.get('/api/chesscom/recent-games', async (request) => {
    const user = await userProfileService.getOrCreate(db, request.user);
    if (!user.chesscomUsername) {
      throw new NotFoundError('No linked Chess.com username');
    }
    return chesscomClient.fetchRecentGames(user.chesscomUsername);
  });
}
