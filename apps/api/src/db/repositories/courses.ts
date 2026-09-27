import { CourseDocumentSchema, type CourseDocument, type CourseKind, type CourseStatus } from '@freechesscoach/shared';
import type { Kysely, Selectable } from 'kysely';
import type { CoursesTable, Database } from '../schema.js';

export type CourseRow = Selectable<CoursesTable>;

export interface CourseSummaryRow {
  id: string;
  slug: string;
  kind: CourseKind;
  status: CourseStatus;
  title: string;
  publishedAt: Date | null;
  updatedAt: Date;
}

export interface NewCourse {
  ownerId: string;
  slug: string;
  kind: CourseKind;
  title: string;
  sourcePgn: string;
  direction: string;
  /** Null until a draft exists (generation or the skeleton writes it). */
  document: CourseDocument | null;
}

export async function insert(db: Kysely<Database>, values: NewCourse): Promise<CourseRow> {
  const document = values.document === null ? null : JSON.stringify(CourseDocumentSchema.parse(values.document));
  return db
    .insertInto('courses')
    .values({ ...values, document })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function findByIdForOwner(db: Kysely<Database>, id: string, ownerId: string): Promise<CourseRow | undefined> {
  return db.selectFrom('courses').selectAll().where('id', '=', id).where('ownerId', '=', ownerId).executeTakeFirst();
}

/** Validates the draft before it is written; the title column follows it. */
export async function updateDraft(
  db: Kysely<Database>,
  id: string,
  ownerId: string,
  document: CourseDocument
): Promise<CourseRow | undefined> {
  const parsed = CourseDocumentSchema.parse(document);
  return db
    .updateTable('courses')
    .set({ document: JSON.stringify(parsed), title: parsed.title, updatedAt: new Date() })
    .where('id', '=', id)
    .where('ownerId', '=', ownerId)
    .returningAll()
    .executeTakeFirst();
}

export function listByOwner(db: Kysely<Database>, ownerId: string): Promise<CourseSummaryRow[]> {
  return db
    .selectFrom('courses')
    .select(['id', 'slug', 'kind', 'status', 'title', 'publishedAt', 'updatedAt'])
    .where('ownerId', '=', ownerId)
    .orderBy('updatedAt', 'desc')
    .execute();
}

/** No owner check: the publish service checks ownership first, and the
 * moderator script sets `removed` for any course (docs/courses.md §9). */
export async function setStatus(db: Kysely<Database>, id: string, status: CourseStatus): Promise<boolean> {
  const result = await db
    .updateTable('courses')
    .set({ status, updatedAt: new Date() })
    .where('id', '=', id)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/** Account deletion only. */
export async function deleteByOwnerId(db: Kysely<Database>, ownerId: string): Promise<void> {
  await db.deleteFrom('courses').where('ownerId', '=', ownerId).execute();
}
