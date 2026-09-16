import { z } from 'zod';
import { MISTAKE_CATEGORIES } from '../constants.js';
import { DirectionSchema, EvidenceTrackSchema } from './axes.js';

/**
 * The shared shape every `docs/diagnose.md` §II family catalog (Task 52.2)
 * is built from — see `packages/shared/src/diagnosis/families/README.md`
 * for how `directions`, `evidenceTrack`, `detectability` and
 * `parentCategory` are assigned, since only `id`/`label`/`diagnosis`/
 * `ratingPrior` come straight from the spec's own table columns.
 */
export const DIAGNOSIS_FAMILIES = [
  'RB',
  'BV',
  'MS',
  'TA',
  'CA',
  'TM',
  'MX',
  'OP',
  'EV',
  'ST',
  'PW',
  'AT',
  'DF',
  'CV',
  'EG',
  'PS',
  'LR',
  'PD'
] as const;
export const DiagnosisFamilySchema = z.enum(DIAGNOSIS_FAMILIES);
export type DiagnosisFamily = z.infer<typeof DiagnosisFamilySchema>;

/** The spec's own per-family code counts (§II.B–R), summing to 410. Each
 * family's test asserts its own array matches its entry here. */
export const DIAGNOSIS_FAMILY_CODE_COUNTS: Record<DiagnosisFamily, number> = {
  RB: 15,
  BV: 22,
  MS: 14,
  TA: 45,
  CA: 30,
  TM: 17,
  MX: 4,
  OP: 21,
  EV: 24,
  ST: 35,
  PW: 33,
  AT: 20,
  DF: 18,
  CV: 17,
  EG: 54,
  PS: 17,
  LR: 18,
  PD: 6
};

/** Task 52.2: `'probe'` for all of `RB-*` (§DQ-17 — rules can't be tested in
 * online play, which blocks illegal moves), `'unsupported'` for
 * `MX-01..MX-03`, `'dialogue'` everywhere else until a Phase 53+ detector
 * flips a specific code to `'detector'`. */
export const DETECTABILITIES = ['detector', 'dialogue', 'probe', 'unsupported'] as const;
export const DetectabilitySchema = z.enum(DETECTABILITIES);
export type Detectability = z.infer<typeof DetectabilitySchema>;

const DIAGNOSIS_CODE_ID_PATTERN = /^[A-Z]{2}-\d{2}$/;
export const DiagnosisCodeIdSchema = z.string().regex(DIAGNOSIS_CODE_ID_PATTERN);
export type DiagnosisCodeId = z.infer<typeof DiagnosisCodeIdSchema>;

export const DiagnosisCodeEntrySchema = z
  .object({
    id: DiagnosisCodeIdSchema,
    family: DiagnosisFamilySchema,
    label: z.string().min(1),
    diagnosis: z.string().min(1),
    ratingPrior: z.tuple([z.number().int().min(100).max(2500), z.number().int().min(100).max(2500)]),
    directions: z.array(DirectionSchema).min(1),
    evidenceTrack: EvidenceTrackSchema,
    detectability: DetectabilitySchema,
    parentCategory: z.enum(MISTAKE_CATEGORIES)
  })
  .refine((entry) => entry.id.startsWith(`${entry.family}-`), {
    message: 'id must start with its own family prefix'
  })
  .refine((entry) => entry.ratingPrior[0] <= entry.ratingPrior[1], {
    message: 'ratingPrior must be ascending (§0.1 Primary CR prior)'
  });
export type DiagnosisCodeEntry = z.infer<typeof DiagnosisCodeEntrySchema>;
