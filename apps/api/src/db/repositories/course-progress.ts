import { sql, type Kysely } from 'kysely';
import type { Database } from '../schema.js';

export interface CourseProgressRow {
  drillKey: string;
  san: string;
  courseSlug: string;
  step: number;
  dueOn: string | null;
  updatedAt: Date;
}

const COLUMNS = ['drillKey', 'san', 'courseSlug', 'step', sql<string | null>`due_on::text`.as('dueOn'), 'updatedAt'] as const;

export function findByKeys(db: Kysely<Database>, userId: string, keys: readonly string[]): Promise<CourseProgressRow[]> {
  if (!keys.length) return Promise.resolve([]);
  return db.selectFrom('courseProgress').select([...COLUMNS]).where('userId', '=', userId).where('drillKey', 'in', keys).execute();
}

export interface CourseProgressWrite {
  drillKey: string;
  san: string;
  courseSlug: string;
  step: number;
  dueOn: string | null;
}

/** A drill's result replaces the row. */
export async function save(db: Kysely<Database>, userId: string, rows: readonly CourseProgressWrite[]): Promise<void> {
  if (!rows.length) return;
  await db
    .insertInto('courseProgress')
    .values(rows.map((row) => ({ userId, ...row, updatedAt: new Date() })))
    .onConflict((conflict) =>
      conflict.columns(['userId', 'drillKey']).doUpdateSet((eb) => ({
        san: eb.ref('excluded.san'),
        courseSlug: eb.ref('excluded.courseSlug'),
        step: eb.ref('excluded.step'),
        dueOn: eb.ref('excluded.dueOn'),
        updatedAt: eb.ref('excluded.updatedAt')
      }))
    )
    .execute();
}

/** Progress from the browser: kept only where it is newer than the account's. */
export async function merge(db: Kysely<Database>, userId: string, rows: readonly (CourseProgressWrite & { updatedAt: Date })[]): Promise<void> {
  if (!rows.length) return;
  await db
    .insertInto('courseProgress')
    .values(rows.map((row) => ({ userId, ...row })))
    .onConflict((conflict) =>
      conflict
        .columns(['userId', 'drillKey'])
        .doUpdateSet((eb) => ({
          san: eb.ref('excluded.san'),
          courseSlug: eb.ref('excluded.courseSlug'),
          step: eb.ref('excluded.step'),
          dueOn: eb.ref('excluded.dueOn'),
          updatedAt: eb.ref('excluded.updatedAt')
        }))
        .where(sql<boolean>`excluded.updated_at > course_progress.updated_at`)
    )
    .execute();
}

export interface DueCourse {
  slug: string;
  title: string;
  due: number;
  sans: string[];
}

/** Moves due on or before `today`, by the course they were drilled from;
 * a course taken down drops out. */
export async function dueByCourse(db: Kysely<Database>, userId: string, today: string): Promise<DueCourse[]> {
  const rows = await db
    .selectFrom('courseProgress')
    .innerJoin('courses', 'courses.slug', 'courseProgress.courseSlug')
    .select([
      'courseProgress.courseSlug as slug',
      sql<string>`courses.published_document->>'title'`.as('title'),
      sql<number>`count(*)::int`.as('due'),
      sql<string[]>`(array_agg(course_progress.san ORDER BY course_progress.due_on, course_progress.drill_key))[1:5]`.as('sans')
    ])
    .where('courseProgress.userId', '=', userId)
    .where(sql<boolean>`course_progress.due_on <= ${today}::date`)
    .where('courses.status', 'in', ['unlisted', 'public'])
    .where('courses.publishedDocument', 'is not', null)
    .groupBy(['courseProgress.courseSlug', sql`courses.published_document->>'title'`])
    .orderBy(sql`min(course_progress.due_on)`)
    .execute();
  return rows;
}

export async function deleteByUserId(db: Kysely<Database>, userId: string): Promise<void> {
  await db.deleteFrom('courseProgress').where('userId', '=', userId).execute();
}
