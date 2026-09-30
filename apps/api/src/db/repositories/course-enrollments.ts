import type { CourseEnrollmentPlace, CourseKind, CourseStage } from '@freechesscoach/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface CourseEnrollmentWrite {
  stage: CourseStage;
  place: CourseEnrollmentPlace;
  stagesDone: CourseStage[];
}

/** Saves where the learner is. `completed_at` is set the first time the full
 * drill is among the finished stages, and kept after. `updatedAt` is given
 * only by the sign-in import; then an older copy never replaces a newer one. */
export async function save(db: Kysely<Database>, userId: string, courseId: string, write: CourseEnrollmentWrite, updatedAt?: Date): Promise<void> {
  const at = updatedAt ?? new Date();
  const completed = write.stagesDone.includes('full_drill');
  await db
    .insertInto('courseEnrollments')
    .values({
      userId,
      courseId,
      stage: write.stage,
      place: JSON.stringify(write.place),
      stagesDone: write.stagesDone,
      startedAt: at,
      updatedAt: at,
      completedAt: completed ? at : null
    })
    .onConflict((conflict) => {
      const update = conflict.columns(['userId', 'courseId']).doUpdateSet((eb) => ({
        stage: eb.ref('excluded.stage'),
        place: eb.ref('excluded.place'),
        stagesDone: eb.ref('excluded.stagesDone'),
        updatedAt: eb.ref('excluded.updatedAt'),
        completedAt: sql`coalesce(course_enrollments.completed_at, excluded.completed_at)`
      }));
      return updatedAt ? update.where(sql<boolean>`excluded.updated_at > course_enrollments.updated_at`) : update;
    })
    .execute();
}

export interface CourseEnrollmentRow extends CourseEnrollmentWrite {
  slug: string;
  title: string;
  kind: CourseKind;
  startedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/** The learner's courses, latest activity first; a course taken down drops out. */
export function list(db: Kysely<Database>, userId: string): Promise<CourseEnrollmentRow[]> {
  return db
    .selectFrom('courseEnrollments')
    .innerJoin('courses', 'courses.id', 'courseEnrollments.courseId')
    .select([
      'courses.slug as slug',
      sql<string>`courses.published_document->>'title'`.as('title'),
      'courses.kind as kind',
      'courseEnrollments.stage as stage',
      'courseEnrollments.place as place',
      'courseEnrollments.stagesDone as stagesDone',
      'courseEnrollments.startedAt as startedAt',
      'courseEnrollments.updatedAt as updatedAt',
      'courseEnrollments.completedAt as completedAt'
    ])
    .where('courseEnrollments.userId', '=', userId)
    .where('courses.status', 'in', ['unlisted', 'public'])
    .where('courses.publishedDocument', 'is not', null)
    .orderBy('courseEnrollments.updatedAt', 'desc')
    .execute();
}

export async function remove(db: Kysely<Database>, userId: string, courseId: string): Promise<void> {
  await db.deleteFrom('courseEnrollments').where('userId', '=', userId).where('courseId', '=', courseId).execute();
}

export async function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  await db.deleteFrom('courseEnrollments').where('userId', '=', userId).execute();
}
