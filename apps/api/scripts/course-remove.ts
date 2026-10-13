/**
 * Takes a published course down (docs/courses.md §9): status `removed`, so
 * its page is 404 at the api; its note audio deleted from the bucket when one
 * is configured (COURSE_AUDIO_* env, as the api has). Prints the URL prefix
 * to purge in Cloudflare, whose edge may still hold copies.
 *
 *   npx tsx apps/api/scripts/course-remove.ts <slug>
 *
 * Exits non-zero when the slug is unknown.
 */
import { createDb } from '../src/db/index.js';
import * as courseAudioRepo from '../src/db/repositories/course-audio.js';
import * as coursesRepo from '../src/db/repositories/courses.js';
import { audioStoreConfigFromEnv, createAudioStore } from '../src/services/courses/audio-store.js';

async function main(): Promise<void> {
  const [slug] = process.argv.slice(2);
  if (!slug) throw new Error('Usage: course-remove.ts <slug>');
  const config = audioStoreConfigFromEnv();
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
      const store = createAudioStore(config);
      for (const file of await courseAudioRepo.files(db, course.id)) await store.delete(file.objectKey);
      await courseAudioRepo.keepOnly(db, course.id, []);
      console.log('Deleted its audio from the bucket.');
    }
    if (config) console.log(`Purge this prefix in Cloudflare (Caching → Purge by prefix):\n  ${config.publicUrl}/courses/${slug}/`);
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
