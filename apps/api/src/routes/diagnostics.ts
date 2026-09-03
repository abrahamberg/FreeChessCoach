import { DiagnosisCodeIdSchema, DIAGNOSIS_CODES_BY_ID } from '@freechesscoach/shared';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { getDiagnosticsForUser, getEvidenceForCode } from '../services/diagnostics.js';
import * as userProfileService from '../services/user-profile.js';

/** Task 58.1 — the progress page's code-level counterpart to
 * `routes/dashboard.ts`'s category-level `mistakeTrends`. */
export function registerDiagnosticsRoutes(app: FastifyInstance, db: Kysely<Database>): void {
  app.get<{ Querystring: { timeControl?: string; window?: string } }>(
    '/api/users/me/diagnostics',
    async (request) => {
      const timeControl = request.query.timeControl?.trim() || null;
      const windowEnd = parseWindowEnd(request.query.window);

      const user = await userProfileService.getOrCreate(db, request.user);
      return getDiagnosticsForUser(db, user.id, timeControl, windowEnd);
    }
  );

  app.get<{ Params: { code: string } }>(
    '/api/users/me/diagnostics/:code/evidence',
    async (request) => {
      const parsedCode = DiagnosisCodeIdSchema.safeParse(request.params.code);
      if (!parsedCode.success) {
        throw new ValidationError('Malformed diagnosis code');
      }
      if (!DIAGNOSIS_CODES_BY_ID.has(parsedCode.data)) {
        throw new NotFoundError('Unknown diagnosis code');
      }

      const user = await userProfileService.getOrCreate(db, request.user);
      return getEvidenceForCode(db, user.id, parsedCode.data);
    }
  );
}

function parseWindowEnd(window: string | undefined): Date | null {
  if (!window) return null;
  const parsed = new Date(window);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError('window must be a valid date');
  }
  return parsed;
}
