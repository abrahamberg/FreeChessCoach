import { BUG_REPORT_LIMITS, type CreateBugReportRequest } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as bugReportsRepo from '../db/repositories/bug-reports.js';
import type { Database } from '../db/schema.js';
import { RateLimitError } from '../lib/errors.js';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const USER_AGENT_MAX = 300;

/** Throws `RateLimitError` (429) naming the limit that was hit, so nobody can hammer the form. */
export async function assertCanReport(db: Kysely<Database>, userId: string, now: Date): Promise<void> {
  const recent = await bugReportsRepo.countSince(db, userId, new Date(now.getTime() - BUG_REPORT_LIMITS.windowMinutes * MINUTE_MS));
  if (recent >= BUG_REPORT_LIMITS.perWindow) {
    throw new RateLimitError(
      `You have sent ${BUG_REPORT_LIMITS.perWindow} reports in the last ${BUG_REPORT_LIMITS.windowMinutes} minutes. Please wait a little before sending another.`
    );
  }
  const today = await bugReportsRepo.countSince(db, userId, new Date(now.getTime() - DAY_MS));
  if (today >= BUG_REPORT_LIMITS.perDay) {
    throw new RateLimitError(`You have reached today's limit of ${BUG_REPORT_LIMITS.perDay} reports. Please try again tomorrow.`);
  }
}

export async function createBugReport(
  db: Kysely<Database>,
  userId: string,
  request: CreateBugReportRequest,
  userAgent: string | undefined,
  now: Date = new Date()
): Promise<string> {
  await assertCanReport(db, userId, now);
  return bugReportsRepo.insert(db, {
    userId,
    whatHappened: request.whatHappened,
    whatExpected: request.whatExpected,
    pagePath: request.pagePath ?? null,
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX) : null
  });
}
