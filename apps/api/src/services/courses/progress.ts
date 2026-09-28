import { nextCourseReview } from '@freechesscoach/chess-analysis';
import type { CourseProgressItem, CourseReviewDueResponse, RecordCourseDrillRequest } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as progressRepo from '../../db/repositories/course-progress.js';
import type { CourseProgressRow } from '../../db/repositories/course-progress.js';
import type { Database } from '../../db/schema.js';

/** docs/courses.md §11: the schedule moves on here, from the stored step, so
 * the browser sends only right or wrong. */
export async function recordDrill(db: Kysely<Database>, userId: string, request: RecordCourseDrillRequest): Promise<CourseProgressItem[]> {
  const results = [...new Map(request.results.map((result) => [result.key, result])).values()];
  const stored = new Map((await progressRepo.findByKeys(db, userId, results.map((result) => result.key))).map((row) => [row.drillKey, row]));
  const rows = results.map((result) => ({
    drillKey: result.key,
    san: result.san,
    courseSlug: result.courseSlug,
    ...nextCourseReview(stored.get(result.key) ?? null, result.correct, request.today)
  }));
  await progressRepo.save(db, userId, rows);
  return toItems(await progressRepo.findByKeys(db, userId, rows.map((row) => row.drillKey)));
}

export async function lookup(db: Kysely<Database>, userId: string, keys: string[]): Promise<CourseProgressItem[]> {
  return toItems(await progressRepo.findByKeys(db, userId, [...new Set(keys)]));
}

/** Browser progress from before signing in; the newer copy of each move wins. */
export async function importProgress(db: Kysely<Database>, userId: string, items: CourseProgressItem[]): Promise<void> {
  const latest = new Map<string, CourseProgressItem>();
  for (const item of items) {
    const kept = latest.get(item.key);
    if (!kept || kept.updatedAt < item.updatedAt) latest.set(item.key, item);
  }
  const now = Date.now();
  await progressRepo.merge(
    db,
    userId,
    [...latest.values()].map((item) => ({
      drillKey: item.key,
      san: item.san,
      courseSlug: item.courseSlug,
      step: item.step,
      dueOn: item.dueOn,
      // A browser clock ahead of ours can't pin a row against later drills.
      updatedAt: new Date(Math.min(Date.parse(item.updatedAt) || 0, now))
    }))
  );
}

export async function due(db: Kysely<Database>, userId: string, today: string): Promise<CourseReviewDueResponse> {
  return { courses: await progressRepo.dueByCourse(db, userId, today) };
}

function toItems(rows: CourseProgressRow[]): CourseProgressItem[] {
  return rows.map((row) => ({ key: row.drillKey, san: row.san, courseSlug: row.courseSlug, step: row.step, dueOn: row.dueOn, updatedAt: row.updatedAt.toISOString() }));
}
