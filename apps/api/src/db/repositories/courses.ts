import type { CourseDossier } from '@freechesscoach/chess-analysis';
import { CourseDocumentSchema, type CourseClipLinks, type CourseDocument, type CourseKind, type CourseStatus } from '@freechesscoach/shared';
import { sql, type Kysely, type RawBuilder, type Selectable } from 'kysely';
import type { CoursesTable, Database } from '../schema.js';

export type CourseRow = Selectable<CoursesTable>;

export interface CourseSummaryRow {
  id: string;
  slug: string;
  kind: CourseKind;
  status: CourseStatus;
  accessLevel: number;
  title: string;
  publishedAt: Date | null;
  updatedAt: Date;
  promise: string | null;
  episodes: number | null;
  moves: number | null;
  level: { rating: number; order: number } | null;
}

/** A course's content as the import writes it, in one go. */
export interface CourseContent {
  sourcePgn: string;
  direction: string;
  document: CourseDocument;
  /** Null for a reading course: no moves, no engine pass. */
  dossier: CourseDossier | null;
}

export async function insert(db: Kysely<Database>, values: CourseContent & { createdBy: string; slug: string }): Promise<CourseRow> {
  const document = CourseDocumentSchema.parse(values.document);
  return db
    .insertInto('courses')
    .values({
      createdBy: values.createdBy,
      slug: values.slug,
      kind: document.kind,
      title: document.title,
      sourcePgn: values.sourcePgn,
      direction: values.direction,
      document: JSON.stringify(document),
      dossier: values.dossier && JSON.stringify(values.dossier)
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function findById(db: Kysely<Database>, id: string): Promise<CourseRow | undefined> {
  return db.selectFrom('courses').selectAll().where('id', '=', id).executeTakeFirst();
}

/** Any status, removed included: an import must not take a removed course's address. */
export function findBySlug(db: Kysely<Database>, slug: string): Promise<CourseRow | undefined> {
  return db.selectFrom('courses').selectAll().where('slug', '=', slug).executeTakeFirst();
}

/** The draft, its tree and its dossier, in one write; the published copy
 * stays until the next publish. */
export async function replaceContent(db: Kysely<Database>, id: string, values: CourseContent): Promise<CourseRow | undefined> {
  const document = CourseDocumentSchema.parse(values.document);
  return db
    .updateTable('courses')
    .set({
      document: JSON.stringify(document),
      title: document.title,
      sourcePgn: values.sourcePgn,
      direction: values.direction,
      dossier: values.dossier && JSON.stringify(values.dossier),
      updatedAt: new Date()
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

/** Where the videos were posted, on the draft and on the published copy
 * alike (`jsonb_set` on a null copy stays null). */
export async function setClipLinks(db: Kysely<Database>, id: string, clipLinks: CourseClipLinks): Promise<void> {
  const links = JSON.stringify(clipLinks);
  await db
    .updateTable('courses')
    .set({
      document: sql`jsonb_set(document, '{clipLinks}', ${links}::jsonb)`,
      publishedDocument: sql`jsonb_set(published_document, '{clipLinks}', ${links}::jsonb)`,
      updatedAt: new Date()
    })
    .where('id', '=', id)
    .execute();
}

/** The course and, by cascade, its audio rows and enrollments. Returns the
 * audio files' object keys, so the bucket can be cleaned too. */
export async function remove(db: Kysely<Database>, id: string): Promise<string[] | undefined> {
  return db.transaction().execute(async (trx) => {
    const audio = await trx.selectFrom('courseAudio').select('objectKey').where('courseId', '=', id).execute();
    const deleted = await trx.deleteFrom('courses').where('id', '=', id).executeTakeFirst();
    return deleted.numDeletedRows > 0n ? audio.map((row) => row.objectKey) : undefined;
  });
}

/** Every course, newest edit first: the editors' list (all editors share them). */
export function listAll(db: Kysely<Database>): Promise<CourseSummaryRow[]> {
  return db
    .selectFrom('courses')
    .select([
      'id',
      'slug',
      'kind',
      'status',
      'accessLevel',
      'title',
      'publishedAt',
      'updatedAt',
      sql<{ rating: number; order: number } | null>`document->'level'`.as('level'),
      sql<string | null>`document->>'promise'`.as('promise'),
      sql<number | null>`jsonb_array_length(document->'episodes')`.as('episodes'),
      sql<number | null>`jsonb_array_length(document->'nodes')`.as('moves')
    ])
    .orderBy('updatedAt', 'desc')
    .execute();
}

/** docs/courses.md §9: the draft becomes the frozen copy learners see. */
export async function publish(db: Kysely<Database>, id: string, document: CourseDocument, status: 'unlisted' | 'public', accessLevel: number): Promise<CourseRow> {
  const parsed = CourseDocumentSchema.parse(document);
  return db
    .updateTable('courses')
    .set({ publishedDocument: JSON.stringify(parsed), status, accessLevel, publishedAt: new Date(), updatedAt: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** The engine pass alone (scripts/course-dossier-refresh.ts). */
export async function setDossier(db: Kysely<Database>, id: string, dossier: CourseDossier): Promise<void> {
  await db.updateTable('courses').set({ dossier: JSON.stringify(dossier) }).where('id', '=', id).execute();
}

/** Only the codes, on the draft and the frozen copy (`jsonb_set` on a null
 * column stays null): scripts/course-dossier-refresh.ts. */
export async function setDiagnosisCodes(db: Kysely<Database>, id: string, codes: readonly string[]): Promise<void> {
  const value = JSON.stringify(codes);
  await db
    .updateTable('courses')
    .set({ document: sql`jsonb_set(document, '{diagnosisCodes}', ${value}::jsonb)`, publishedDocument: sql`jsonb_set(published_document, '{diagnosisCodes}', ${value}::jsonb)` })
    .where('id', '=', id)
    .execute();
}

/** An editor's visibility change, and the moderator script's `removed` (docs/courses.md §9). */
export async function setVisibility(db: Kysely<Database>, id: string, values: { status?: CourseStatus; accessLevel?: number }): Promise<boolean> {
  const result = await db
    .updateTable('courses')
    .set({ ...values, updatedAt: new Date() })
    .where('id', '=', id)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/** docs/courses.md §9: whether `userId` (null: signed out) may open a
 * course. Level 0 is everyone's; a members-only course is for course
 * editors and for users at its level or above. Every learner-side read of
 * courses filters by this. */
export function readableBy(userId: string | null): RawBuilder<boolean> {
  if (userId === null) return sql<boolean>`courses.access_level = 0`;
  return sql<boolean>`(courses.access_level = 0 OR EXISTS (SELECT 1 FROM users WHERE users.id = ${userId} AND (users.can_edit_courses OR courses.access_level <= users.course_access_level)))`;
}

/** A course anyone with the link may see: unlisted or public, with a
 * published copy, and readable by `userId`. Drafts, removed courses and
 * another level's members-only courses are not found. */
export function findPublishedBySlug(db: Kysely<Database>, slug: string, userId: string | null): Promise<Pick<CourseRow, 'id' | 'slug' | 'publishedDocument' | 'publishedAt' | 'dossier'> | undefined> {
  return db
    .selectFrom('courses')
    .select(['id', 'slug', 'publishedDocument', 'publishedAt', 'dossier'])
    .where('slug', '=', slug)
    .where('status', 'in', ['unlisted', 'public'])
    .where('publishedDocument', 'is not', null)
    .where(readableBy(userId))
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
  level: { rating: number; order: number } | null;
  diagnosisCodes: string[];
  series: { name: string; position: number; total?: number; module?: string } | null;
  tags: string[];
  accessLevel: number;
}

/** docs/courses.md §9: `public` courses readable by `userId` with a published copy, newest first
 * (or, `curriculum`, by level: rating, then place, then newest; paged by
 * position, `offset`),
 * read from the published copy (the title a learner sees). `before` is the
 * last row of the previous page. */
export function listPublic(
  db: Kysely<Database>,
  options: { userId: string | null; kind?: CourseKind; code?: string; before?: { cursorAt: string; id: string }; limit: number; sort?: 'curriculum' | 'newest'; offset?: number }
): Promise<CatalogRow[]> {
  let query = db
    .selectFrom('courses')
    .select([
      'id',
      'slug',
      'kind',
      'publishedAt',
      'accessLevel',
      sql<string>`published_at::text`.as('cursorAt'),
      sql<string>`published_document->>'title'`.as('title'),
      sql<string | null>`published_document->>'promise'`.as('promise'),
      sql<string | null>`published_document->>'levelBand'`.as('levelBand'),
      sql<string | null>`published_document->>'coachPersona'`.as('coachPersona'),
      sql<string | null>`published_document->>'learnerSide'`.as('learnerSide'),
      sql<number>`jsonb_array_length(published_document->'episodes')`.as('episodes'),
      sql<number>`jsonb_array_length(published_document->'nodes')`.as('moves'),
      sql<{ rating: number; order: number } | null>`published_document->'level'`.as('level'),
      sql<string[]>`coalesce(published_document->'diagnosisCodes', '[]'::jsonb)`.as('diagnosisCodes'),
      sql<CatalogRow['series']>`published_document->'series'`.as('series'),
      sql<string[]>`coalesce(published_document->'tags', '[]'::jsonb)`.as('tags')
    ])
    .where('status', '=', 'public')
    .where('publishedDocument', 'is not', null)
    .where('publishedAt', 'is not', null)
    .where(readableBy(options.userId));
  if (options.kind) query = query.where('kind', '=', options.kind);
  if (options.code) query = query.where(sql<boolean>`published_document->'diagnosisCodes' @> ${JSON.stringify([options.code])}::jsonb`);
  if (options.before) {
    const { cursorAt, id } = options.before;
    query = query.where(sql<boolean>`(published_at, id) < (${cursorAt}::timestamptz, ${id}::uuid)`);
  }
  if (options.sort === 'curriculum') {
    query = query
      .orderBy(sql`(published_document->'level'->>'rating')::int`, sql`asc nulls last`)
      .orderBy(sql`(published_document->'level'->>'order')::int`, sql`asc nulls last`)
      .offset(options.offset ?? 0);
  }
  return query.orderBy('publishedAt', 'desc').orderBy('id', 'desc').limit(options.limit).execute() as Promise<CatalogRow[]>;
}

export interface SeriesEntry {
  slug: string;
  title: string;
  position: number;
}

/** The public courses in the series called `name` that `userId` may open,
 * in order: what the lesson pages' next and previous links are taken from. */
export function listPublicInSeries(db: Kysely<Database>, name: string, userId: string | null): Promise<SeriesEntry[]> {
  return db
    .selectFrom('courses')
    .select(['slug', sql<string>`published_document->>'title'`.as('title'), sql<number>`(published_document->'series'->>'position')::int`.as('position')])
    .where('status', '=', 'public')
    .where('publishedDocument', 'is not', null)
    .where(sql<boolean>`published_document->'series'->>'name' = ${name}`)
    .where(readableBy(userId))
    .orderBy(sql`(published_document->'series'->>'position')::int`)
    .orderBy('slug')
    .execute();
}
