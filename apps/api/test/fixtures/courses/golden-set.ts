import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CourseKindSchema, type CourseKind } from '@freechesscoach/shared';
import { z } from 'zod';

const directory = path.dirname(fileURLToPath(import.meta.url));

/** What the app reads of a golden course (the review audit, the golden
 * facts); the studio reads the same files, by path, as whole intakes. */
const GoldenFileSchema = z.object({
  pgn: z.string().min(1),
  kind: CourseKindSchema.exclude(['reading']),
  learnerSide: z.enum(['white', 'black'])
});

export interface GoldenCourse {
  /** The file's name: its kind, then which one ("trap-englund"). */
  name: string;
  kind: Exclude<CourseKind, 'reading'>;
  pgn: string;
  learnerSide: 'white' | 'black';
}

/** docs/courses.md §7: small PGNs, several per kind. Each position that
 * once showed a fault stays here. */
export function loadGoldenSet(): GoldenCourse[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const parsed = GoldenFileSchema.parse(JSON.parse(readFileSync(path.join(directory, file), 'utf8')));
      return { name: path.basename(file, '.json'), ...parsed };
    });
}
