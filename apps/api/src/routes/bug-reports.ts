import { CreateBugReportRequestSchema, type BugReportResponse } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { ValidationError } from '../lib/errors.js';
import { createBugReport } from '../services/bug-reports.js';
import * as userProfileService from '../services/user-profile.js';

export function registerBugReportsRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.post('/api/bug-reports', async (request, reply): Promise<BugReportResponse> => {
    const parsed = CreateBugReportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const user = await userProfileService.getOrCreate(db, request.user);
    const id = await createBugReport(db, user.id, parsed.data, request.headers['user-agent']);
    request.log.info({ userId: user.id, bugReportId: id }, 'Bug report received');
    return reply.code(201).send({ id });
  });
}
