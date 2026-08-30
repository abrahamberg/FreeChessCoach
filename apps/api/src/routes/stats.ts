import { GameSpeedFilterSchema, StatsRangeSchema } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { getStatsDashboard } from '../services/stats-dashboard.js';
import * as userProfileService from '../services/user-profile.js';

const DEFAULT_RANGE = 'all';
const DEFAULT_SPEED = 'rapid';

export function registerStatsRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get<{ Querystring: { range?: string; speed?: string } }>('/api/users/me/stats', async (request) => {
    const range = StatsRangeSchema.safeParse(request.query.range ?? DEFAULT_RANGE);
    if (!range.success) {
      throw new ValidationError(range.error.issues.map((issue) => issue.message).join('; '));
    }
    const speed = GameSpeedFilterSchema.safeParse(request.query.speed ?? DEFAULT_SPEED);
    if (!speed.success) {
      throw new ValidationError(speed.error.issues.map((issue) => issue.message).join('; '));
    }

    const user = await userProfileService.getOrCreate(db, request.user);
    return getStatsDashboard(db, user.id, range.data, speed.data);
  });
}
