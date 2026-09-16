import { z } from 'zod';
import { DirectionSchema, MechanismSchema } from './axes.js';
import { DiagnosisCodeIdSchema } from './catalog-types.js';

/**
 * §I.1 "Final diagnosis format": leaf skill . mechanism . direction +
 * context + history. History status isn't part of the ref itself — it's a
 * property of a *finding over time*, not of one diagnosis reference — so
 * this schema covers `code.mechanism.direction` plus an optional bracketed
 * `context` (e.g. an opening name for an `OP-*` code).
 */
export const DiagnosisRefSchema = z.object({
  code: DiagnosisCodeIdSchema,
  mechanism: MechanismSchema,
  direction: DirectionSchema,
  context: z.string().min(1).optional()
});
export type DiagnosisRef = z.infer<typeof DiagnosisRefSchema>;

/** `code.mechanism[.direction][ [context]]` — purely structural; whether
 * `code`/`mechanism`/`direction` are real values is enforced afterward by
 * `DiagnosisRefSchema.parse`, not by this regex. */
const DIAGNOSIS_REF_PATTERN = /^([^.]+)\.([^.[\]]+)(?:\.([^.[\]]+))?(?: \[(.+)\])?$/;

export function renderDiagnosisRef(ref: DiagnosisRef): string {
  const core =
    ref.direction === 'N' ? `${ref.code}.${ref.mechanism}` : `${ref.code}.${ref.mechanism}.${ref.direction}`;
  return ref.context ? `${core} [${ref.context}]` : core;
}

export function parseDiagnosisRef(input: string): DiagnosisRef {
  const match = DIAGNOSIS_REF_PATTERN.exec(input.trim());
  if (!match) throw new Error(`Malformed diagnosis reference: ${input}`);
  const [, code, mechanism, direction, context] = match;
  return DiagnosisRefSchema.parse({
    code,
    mechanism,
    direction: direction ?? 'N',
    ...(context ? { context } : {})
  });
}
