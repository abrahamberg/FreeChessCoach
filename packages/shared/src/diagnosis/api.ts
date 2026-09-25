import { z } from 'zod';
import {
  DirectionSchema,
  EmittableConfidenceLevelSchema,
  HistoryStatusSchema,
  ScopeTagSchema,
  SeveritySchema
} from './axes.js';
import { DiagnosisCodeIdSchema } from './catalog-types.js';
import { DataQualityGateIdSchema } from './data-quality.js';

/**
 * Task 58.1's wire shapes for `GET /api/users/me/diagnostics` and
 * `GET /api/users/me/diagnostics/:code/evidence` — the HTTP-facing
 * counterparts of `DiagnosticProfileEntry`/`FiredGate`
 * (`@freechesscoach/chess-analysis`), which stay internal (the frontend
 * never imports that package). `label` is resolved server-side
 * (`DIAGNOSIS_CODES_BY_ID`) so the client doesn't need the 410-code catalog
 * just to render a heading — same choice `diagnostic-report.ts` already made
 * for the coach-tool digest.
 */
export const DiagnosticProfileSpreadSchema = z.object({
  games: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  openings: z.number().int().nonnegative(),
  sides: z.number().int().nonnegative()
});
export type DiagnosticProfileSpread = z.infer<typeof DiagnosticProfileSpreadSchema>;

export const ControlSkillResponseSchema = z.object({
  code: DiagnosisCodeIdSchema,
  label: z.string(),
  direction: DirectionSchema,
  failureRate: z.number()
});
export type ControlSkillResponse = z.infer<typeof ControlSkillResponseSchema>;

export const FiredGateResponseSchema = z.object({
  code: DataQualityGateIdSchema,
  label: z.string(),
  evidence: z.string()
});
export type FiredGateResponse = z.infer<typeof FiredGateResponseSchema>;

export const DiagnosisEntryResponseSchema = z.object({
  code: DiagnosisCodeIdSchema,
  label: z.string(),
  direction: DirectionSchema,
  opportunities: z.number().int().nonnegative(),
  episodes: z.number().int().nonnegative(),
  failureRate: z.number(),
  confidence: EmittableConfidenceLevelSchema,
  spread: DiagnosticProfileSpreadSchema,
  severityMix: z.partialRecord(SeveritySchema, z.number()),
  scopeTags: z.array(ScopeTagSchema),
  controlSkill: ControlSkillResponseSchema.nullable(),
  historyStatus: HistoryStatusSchema,
  firedGates: z.array(FiredGateResponseSchema)
});
export type DiagnosisEntryResponse = z.infer<typeof DiagnosisEntryResponseSchema>;

/** `null` when the user has no stored profile yet for the requested (or
 * auto-picked) time control — a normal, expected answer (same "no confident
 * diagnoses yet" precedent as the coach tool), not an error. */
export const DiagnosticsResponseSchema = z.object({
  timeControl: z.string().nullable(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  computedAt: z.string().nullable(),
  /** Rated games the profile was built from, so the page can call a small
   * one an early read. `0` when there is no profile (or an older recorded
   * response that predates the field). */
  windowGames: z.number().int().nonnegative().default(0),
  entries: z.array(DiagnosisEntryResponseSchema)
});
export type DiagnosticsResponse = z.infer<typeof DiagnosticsResponseSchema>;

/** `GET /api/users/me/diagnostics/readiness` — how close the user is to the
 * rated-game minimum the profile needs. `ratedGames` counts the single
 * time control with the most rated games (the profile never pools across
 * time controls), `null` `timeControl` when there are none. */
export const DiagnosticReadinessResponseSchema = z.object({
  required: z.number().int().positive(),
  ratedGames: z.number().int().nonnegative(),
  timeControl: z.string().nullable(),
  ready: z.boolean()
});
export type DiagnosticReadinessResponse = z.infer<typeof DiagnosticReadinessResponseSchema>;

export const DiagnosticEvidenceItemSchema = z.object({
  gameId: z.string(),
  ply: z.number().int().nonnegative(),
  direction: DirectionSchema,
  failed: z.boolean(),
  hwdl: z.number(),
  severity: SeveritySchema,
  reachability: z.number(),
  createdAt: z.string()
});
export type DiagnosticEvidenceItem = z.infer<typeof DiagnosticEvidenceItemSchema>;

export const DiagnosticEvidenceResponseSchema = z.object({
  code: DiagnosisCodeIdSchema,
  label: z.string(),
  items: z.array(DiagnosticEvidenceItemSchema)
});
export type DiagnosticEvidenceResponse = z.infer<typeof DiagnosticEvidenceResponseSchema>;
