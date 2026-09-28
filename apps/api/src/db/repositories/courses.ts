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
  /** From the draft; empty and 0 before one exists. */
  promise: string | null;
  episodes: number | null;
  moves: number | null;
  generation: CourseGeneration | null;
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
export function findPublishedBySlug(db: Kysely<Database>, slug: string): Promise<Pick<CourseRow, 'id' | 'slug' | 'publishedDocument' | 'publishedAt' | 'dossier'> | undefined> {
  return db
    .selectFrom('courses')
    .select(['id', 'slug', 'publishedDocument', 'publishedAt', 'dossier'])
    .where('slug', '=', slug)
    .where('status', 'in', ['unlisted', 'public'])
    .where('publishedDocument', 'is not', null)
    .executeTakeFirst();
}

export interface CatalogRow {
  id: string;
  slug: string;
  title: string;
  promise: string | null;
  kind: CourseKind;
  levelBand: string | null;
  coachPersona: string | null;
  learnerSide: string | null;
  publishedAt: Date;
  /** `published_at` to the microsecond, for the next page's cursor. */
  cursorAt: string;
  episodes: number;
  moves: number;
}

/** docs/courses.md §9: `public` courses with a published copy, newest first,
 * read from the published copy (the title a learner sees). `before` is the
 * last row of the previous page. */
export function listPublic(
  db: Kysely<Database>,
  options: { kind?: CourseKind; before?: { cursorAt: string; id: string }; limit: number }
): Promise<CatalogRow[]> {
  let query = db
    .selectFrom('courses')
    .select([
      'id',
      'slug',
      'kind',
      'publishedAt',
      sql<string>`published_at::text`.as('cursorAt'),
      sql<string>`published_document->>'title'`.as('title'),
      sql<string | null>`published_document->>'promise'`.as('promise'),
      sql<string | null>`published_document->>'levelBand'`.as('levelBand'),
      sql<string | null>`published_document->>'coachPersona'`.as('coachPersona'),
      sql<string | null>`published_document->>'learnerSide'`.as('learnerSide'),
      sql<number>`jsonb_array_length(published_document->'episodes')`.as('episodes'),
      sql<number>`jsonb_array_length(published_document->'nodes')`.as('moves')
    ])
    .where('status', '=', 'public')
    .where('publishedDocument', 'is not', null)
    .where('publishedAt', 'is not', null);
  if (options.kind) query = query.where('kind', '=', options.kind);
  if (options.before) {
    const { cursorAt, id } = options.before;
    query = query.where(sql<boolean>`(published_at, id) < (${cursorAt}::timestamptz, ${id}::uuid)`);
  }
  return query.orderBy('publishedAt', 'desc').orderBy('id', 'desc').limit(options.limit).execute() as Promise<CatalogRow[]>;
}

/** How many of the owner's courses sit at this level (Phase 90's curriculum). */
export async function countAtLevel(db: Kysely<Database>, ownerId: string, rating: number): Promise<number> {
  const row = await db
    .selectFrom('courses')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('ownerId', '=', ownerId)
    .where(sql<boolean>`(document->'level'->>'rating')::int = ${rating}`)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
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
    .select([
      'id',
      'slug',
      'kind',
      'status',
      'title',
      'publishedAt',
      'updatedAt',
      'generation',
      sql<string | null>`document->>'promise'`.as('promise'),
      sql<number | null>`jsonb_array_length(document->'episodes')`.as('episodes'),
      sql<number | null>`jsonb_array_length(document->'nodes')`.as('moves')
    ])
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
