import type { CourseDossier } from '@freechesscoach/chess-analysis';
import { CourseDocumentSchema, CourseGenerationSchema, type CourseDocument, type CourseGeneration, type CourseKind, type CourseStatus } from '@freechesscoach/shared';
import { sql, type Kysely, type Selectable } from 'kysely';
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

/** A course anyone with the link may see: unlisted or public, with a
 * published copy. Drafts and removed courses are not found. */
export function findPublishedBySlug(db: Kysely<Database>, slug: string): Promise<Pick<CourseRow, 'id' | 'slug' | 'publishedDocument' | 'publishedAt'> | undefined> {
  return db
    .selectFrom('courses')
    .select(['id', 'slug', 'publishedDocument', 'publishedAt'])
    .where('slug', '=', slug)
    .where('status', 'in', ['unlisted', 'public'])
    .where('publishedDocument', 'is not', null)
    .executeTakeFirst();
}

/** No owner check: the generation job, which runs for the owner. */
export function findById(db: Kysely<Database>, id: string): Promise<CourseRow | undefined> {
  return db.selectFrom('courses').selectAll().where('id', '=', id).executeTakeFirst();
}

/** The job's state; validated like the draft. Leaves `updatedAt` alone, so
 * polling the progress doesn't look like an edit. */
export async function setGeneration(db: Kysely<Database>, id: string, generation: CourseGeneration): Promise<void> {
  await db
    .updateTable('courses')
    .set({ generation: JSON.stringify(CourseGenerationSchema.parse(generation)) })
    .where('id', '=', id)
    .execute();
}

/** Only the heartbeat, so it never races the job's own saves. */
export async function touchGeneration(db: Kysely<Database>, id: string, at: Date): Promise<void> {
  await db
    .updateTable('courses')
    .set({ generation: sql`jsonb_set(generation, '{heartbeatAt}', to_jsonb(${at.toISOString()}::text))` })
    .where('id', '=', id)
    .where(sql`generation->>'status'`, '=', 'running')
    .execute();
}

export async function setDossier(db: Kysely<Database>, id: string, dossier: CourseDossier): Promise<void> {
  await db.updateTable('courses').set({ dossier: JSON.stringify(dossier) }).where('id', '=', id).execute();
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

/** docs/courses.md §9: the draft becomes the frozen copy learners see. */
export async function publish(
  db: Kysely<Database>,
  id: string,
  ownerId: string,
  document: CourseDocument,
  status: 'unlisted' | 'public'
): Promise<CourseRow> {
  const parsed = CourseDocumentSchema.parse(document);
  return db
    .updateTable('courses')
    .set({ publishedDocument: JSON.stringify(parsed), status, publishedAt: new Date(), updatedAt: new Date() })
    .where('id', '=', id)
    .where('ownerId', '=', ownerId)
    .returningAll()
    .executeTakeFirstOrThrow();
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
