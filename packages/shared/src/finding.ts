import { z } from 'zod';
import { MISTAKE_CATEGORIES } from './constants.js';
import { DIAGNOSIS_CODES_BY_ID, DiagnosisCodeIdSchema, DirectionSchema, MechanismSchema } from './diagnosis/index.js';

export const FindingSeveritySchema = z.enum(['minor', 'significant', 'critical']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

/**
 * `diagnosisCode`/`mechanism`/`direction` are Task 57.1's structured
 * vocabulary (`docs/diagnose.md` §I.2, §5) — optional so existing findings
 * (and any caller that hasn't adopted them yet) stay valid. `category`
 * stays required, unchanged, so the dashboard/trend chart keep reading it
 * untouched; when `diagnosisCode` resolves against the catalog, its
 * `parentCategory` overrides whatever `category` was supplied, so the two
 * can never disagree. An out-of-catalog `diagnosisCode` is NOT rejected
 * here — `DiagnosisCodeIdSchema` is only a format check (same precedent as
 * `packages/shared/src/diagnosis/catalog-types.ts`, which never inlines
 * all 410 ids into a zod enum). `progress.ts`'s `assertValidDiagnosisCode`
 * is the actual closed-enum gate (AGENTS.md rule 8) that rejects an
 * out-of-catalog code before anything is persisted.
 */
export const FindingSchema = z
  .object({
    category: z.enum(MISTAKE_CATEGORIES),
    severity: FindingSeveritySchema,
    ply: z.number().int().nonnegative().nullable(),
    description: z.string(),
    isPositive: z.boolean(),
    diagnosisCode: DiagnosisCodeIdSchema.optional(),
    mechanism: MechanismSchema.optional(),
    direction: DirectionSchema.optional()
  })
  .transform((finding) => {
    const parentCategory = finding.diagnosisCode ? DIAGNOSIS_CODES_BY_ID.get(finding.diagnosisCode)?.parentCategory : undefined;
    return parentCategory ? { ...finding, category: parentCategory } : finding;
  });
export type Finding = z.infer<typeof FindingSchema>;

/**
 * Task 57.3 — selection of WHICH diagnosis code becomes a focus area is now
 * programmatic (`progress.ts`'s `syncProgrammaticFocusAreas`, driven by
 * `select-focus.ts`'s §IV objective+overrides), so the LLM-facing action set
 * drops `'create'`: this tool now only records a state transition and a note
 * on a focus area the system already selected. Addressed by `diagnosisCode`
 * rather than `category` — several active focus areas can now share one
 * broad category (the old `UNIQUE (user_id, category)` constraint is gone),
 * so category alone is no longer a unique enough address.
 */
export const FocusAreaUpdateSchema = z.object({
  diagnosisCode: DiagnosisCodeIdSchema,
  action: z.enum(['progress', 'regress', 'resolve']),
  note: z.string()
});
export type FocusAreaUpdate = z.infer<typeof FocusAreaUpdateSchema>;
