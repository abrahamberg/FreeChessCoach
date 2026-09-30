/**
 * Takes a published course down (docs/courses.md §9): status `removed`, so
 * its page and files are 404 at the api; its note audio deleted from the R2
 * mirror when one is configured (COURSE_AUDIO_* env, as the api has). Prints
 * the URL prefixes to purge in Cloudflare, whose edge may still hold copies.
 *
 *   npx tsx apps/api/scripts/course-remove.ts <slug>
 *
 * Exits non-zero when the slug is unknown.
 */
import { createDb } from '../src/db/index.js';
import * as courseAudioRepo from '../src/db/repositories/course-audio.js';
import * as coursesRepo from '../src/db/repositories/courses.js';
import { audioMirrorConfigFromEnv, createR2Mirror, mirrorKey } from '../src/services/courses/audio-mirror.js';

async function main(): Promise<void> {
  const [slug] = process.argv.slice(2);
  if (!slug) throw new Error('Usage: course-remove.ts <slug>');
  const config = audioMirrorConfigFromEnv();
  const db = createDb(process.env.DATABASE_URL ?? 'postgresql://chess_coach:chess_coach@localhost:5432/chess_coach');
  try {
    const course = await db.selectFrom('courses').select(['id', 'slug']).where('slug', '=', slug).executeTakeFirst();
    if (!course) {
      console.error(`No course with slug ${slug}`);
      process.exitCode = 1;
      return;
    }
    await coursesRepo.setStatus(db, course.id, 'removed');
    console.log(`${slug}: removed`);
    if (config) {
      const mirror = createR2Mirror(config);
      for (const file of await courseAudioRepo.files(db, course.id)) {
        if (!file.mirroredHash) continue;
        await mirror.delete(mirrorKey(slug, file.mirroredHash));
        await courseAudioRepo.setMirrored(db, course.id, file.textHash, null);
      }
      console.log('Deleted its audio from the R2 mirror.');
    }
    console.log('Purge these prefixes in Cloudflare (Caching → Purge by prefix):');
    console.log(`  <site>/api/public/courses/${slug}/`);
    if (config) console.log(`  ${config.publicUrl}/courses/${slug}/`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
