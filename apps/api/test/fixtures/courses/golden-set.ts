import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateCourseRequestSchema, type CourseKind } from '@freechesscoach/shared';
import type { CourseIntake } from '../../../src/services/courses.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

export interface GoldenCourse {
  name: CourseKind;
  intake: CourseIntake;
}

/** docs/courses.md §7: one small PGN + direction per kind, as intake forms. */
export function loadGoldenSet(): GoldenCourse[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const intake = CreateCourseRequestSchema.parse(JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
      return { name: intake.kind, intake };
    });
}
