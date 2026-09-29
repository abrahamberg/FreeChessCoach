import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateCourseRequestSchema, type CourseKind } from '@freechesscoach/shared';
import type { CourseIntake } from '../../../src/services/courses.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

export interface GoldenCourse {
  /** The file's name: its kind, then which one ("trap-englund"). */
  name: string;
  kind: CourseKind;
  intake: CourseIntake;
}

/** docs/courses.md §7: small PGNs + directions, several per kind, as intake
 * forms. Each position that once showed a fault stays here. */
export function loadGoldenSet(): GoldenCourse[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const intake = CreateCourseRequestSchema.parse(JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
      return { name: path.basename(file, '.json'), kind: intake.kind, intake };
    });
}
