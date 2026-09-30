import { nextCourseReview } from '@freechesscoach/chess-analysis';
import {
  CourseEnrollmentPlaceSchema,
  type CourseEnrollment,
  type CourseProgressItem,
  type CourseReviewDueResponse,
  type ImportCourseEnrollment,
  type RecordCourseDrillRequest,
  type SaveCourseEnrollmentRequest
} from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as enrollmentsRepo from '../../db/repositories/course-enrollments.js';
import * as progressRepo from '../../db/repositories/course-progress.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { CourseProgressRow } from '../../db/repositories/course-progress.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError } from '../../lib/errors.js';

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

/** Browser progress from before signing in; the newer copy of each move (and
 * of each course's place) wins. */
export async function importProgress(db: Kysely<Database>, userId: string, items: CourseProgressItem[], enrollments: ImportCourseEnrollment[] = []): Promise<void> {
  for (const enrollment of enrollments) {
    const course = await coursesRepo.findPublishedBySlug(db, enrollment.slug);
    if (!course) continue;
    await enrollmentsRepo.save(db, userId, course.id, enrollment, notAhead(enrollment.updatedAt));
  }
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
      updatedAt: notAhead(item.updatedAt, now)
    }))
  );
}

export async function due(db: Kysely<Database>, userId: string, today: string): Promise<CourseReviewDueResponse> {
  return { courses: await progressRepo.dueByCourse(db, userId, today) };
}

function toItems(rows: CourseProgressRow[]): CourseProgressItem[] {
  return rows.map((row) => ({ key: row.drillKey, san: row.san, courseSlug: row.courseSlug, step: row.step, dueOn: row.dueOn, updatedAt: row.updatedAt.toISOString() }));
}

/** A browser clock ahead of ours can't pin a row against later changes. */
function notAhead(iso: string, now = Date.now()): Date {
  return new Date(Math.min(Date.parse(iso) || 0, now));
}

/** docs/courses.md §11: where the learner is in a published course. */
export async function saveEnrollment(db: Kysely<Database>, userId: string, slug: string, request: SaveCourseEnrollmentRequest): Promise<void> {
  await enrollmentsRepo.save(db, userId, await publishedCourseId(db, slug), request);
}

export async function listEnrollments(db: Kysely<Database>, userId: string): Promise<CourseEnrollment[]> {
  return (await enrollmentsRepo.list(db, userId)).map((row) => ({
    slug: row.slug,
    title: row.title,
    kind: row.kind,
    stage: row.stage,
    // Stored by this code, but parsed so an older shape can't reach the page.
    place: CourseEnrollmentPlaceSchema.catch({ episode: 0, step: 0, practice: {} }).parse(row.place),
    stagesDone: row.stagesDone,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null
  }));
}

export async function removeEnrollment(db: Kysely<Database>, userId: string, slug: string): Promise<void> {
  await enrollmentsRepo.remove(db, userId, await publishedCourseId(db, slug));
}

async function publishedCourseId(db: Kysely<Database>, slug: string): Promise<string> {
  const course = await coursesRepo.findPublishedBySlug(db, slug);
  if (!course) throw new NotFoundError('Course not found');
  return course.id;
}
