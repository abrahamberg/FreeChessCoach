/**
 * Rebuilds courses' engine facts (the dossier, docs/courses.md §5.4) with
 * the engine only: no AI call, the course text untouched. For when the
 * dossier's shape changed (Phase 87 added each move's evaluation).
 *
 *   npx tsx apps/api/scripts/course-dossier-refresh.ts [slug …] [--engine-url http://localhost:8081]
 *
 * No slug: every course.
 */
import { parseArgs } from 'node:util';
import { courseDiagnosisCodes } from '@freechesscoach/chess-analysis';
import { CourseDocumentSchema } from '@freechesscoach/shared';
import { createDb } from '../src/db/index.js';
import * as coursesRepo from '../src/db/repositories/courses.js';
import { buildCourseDossierFromEngine } from '../src/services/courses/dossier.js';
import { courseTreeOf } from '../src/services/courses/generation-inputs.js';
import { NativeEngineBackend } from '../src/services/engine/native-engine-backend.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'engine-url': { type: 'string' } } });
  const engine = new NativeEngineBackend(values['engine-url'] ?? 'http://localhost:8081');
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    let query = db.selectFrom('courses').select(['id', 'slug', 'document', 'publishedDocument']);
    if (positionals.length) query = query.where('slug', 'in', positionals);
    for (const row of await query.execute()) {
      const stored = row.document ?? row.publishedDocument;
      if (!stored) {
        console.log(`${row.slug}: no course document yet, skipped`);
        continue;
      }
      // Stored before the codes existed: they are filled in below.
      const document = CourseDocumentSchema.parse({ ...stored, diagnosisCodes: (stored as { diagnosisCodes?: string[] }).diagnosisCodes ?? [] });
      const { dossier } = await buildCourseDossierFromEngine(courseTreeOf(document), document.learnerSide, engine, document.kind);
      await coursesRepo.setDossier(db, row.id, dossier);
      // Both copies (the draft and the frozen one, where there is one) get the codes; a creator's
      // edit to the draft's codes is replaced, which is the point of a refresh.
      const codes = courseDiagnosisCodes(courseTreeOf(document), dossier);
      await coursesRepo.setDiagnosisCodes(db, row.id, codes);
      console.log(`${row.slug}: ${dossier.nodes.length} moves, ${codes.length} codes`);
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
