import { z } from 'zod';

/** How often one signed-in user may send bug reports — shown to the user and
 * enforced by the API (services/bug-reports.ts), so the two cannot disagree. */
export const BUG_REPORT_LIMITS = {
  perWindow: 5,
  windowMinutes: 15,
  perDay: 20
} as const;

export const BUG_REPORT_MAX_LENGTH = 4000;
export const BUG_REPORT_MIN_LENGTH = 10;

const reportText = (label: string) =>
  z
    .string()
    .trim()
    .min(BUG_REPORT_MIN_LENGTH, `Please say a bit more in “${label}” (at least ${BUG_REPORT_MIN_LENGTH} characters)`)
    .max(BUG_REPORT_MAX_LENGTH, `“${label}” must be ${BUG_REPORT_MAX_LENGTH} characters or fewer`);

export const CreateBugReportRequestSchema = z.object({
  whatHappened: reportText('What happened'),
  whatExpected: reportText('What you expected'),
  /** The app page the report was sent from (path only, no query), so a report can be reproduced. */
  pagePath: z.string().max(300).optional()
});
export type CreateBugReportRequest = z.infer<typeof CreateBugReportRequestSchema>;

export const BugReportResponseSchema = z.object({ id: z.string().uuid() });
export type BugReportResponse = z.infer<typeof BugReportResponseSchema>;
