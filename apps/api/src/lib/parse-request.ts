import type { z } from 'zod';
import { ValidationError } from './errors.js';

/** A request's body or query against its schema; a mismatch is a 400 that
 * lists what is wrong. */
export function parseRequest<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join('; '));
  return parsed.data;
}
