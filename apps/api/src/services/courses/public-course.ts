import type { CourseDossier } from '@freechesscoach/chess-analysis';
import { CourseCatalogItemSchema, CourseDocumentSchema, type CourseCatalogQuery, type CourseCatalogResponse, type CourseDocument, type PublicCourseResponse } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import type { AudioMirror } from './audio-mirror.js';
import { audioFileUrl } from './audio-mirror-sync.js';
import { noteHashes } from './note-audio.js';

const NOT_FOUND = 'No course at this link';

/** Note audio files are named by their bytes' hash; only WAV is stored (§8). */
const AUDIO_FILE = /^([0-9a-f]{32})\.wav$/;

/** docs/courses.md §9: the frozen published copy, each note's audio file,
 * and each move's evaluation from the engine pass (the eval bar and graph).
 * The file is named by its content, so its URL never serves different bytes
 * and Cloudflare can keep it at the edge; from the R2 mirror once copied there. Drafts and removed courses are 404,
 * like a wrong link. */
export async function publicCourse(db: Kysely<Database>, slug: string, mirror?: AudioMirror): Promise<PublicCourseResponse> {
  const row = await coursesRepo.findPublishedBySlug(db, slug);
  if (!row?.publishedDocument || !row.publishedAt) throw new NotFoundError(NOT_FOUND);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  const files = new Map((await courseAudioRepo.files(db, row.id)).map((file) => [file.textHash, file]));
  const noteAudio = Object.fromEntries(
    noteHashes(document).flatMap((note) => {
      const file = files.get(note.hash);
      return file ? [[`${note.episodeId}:${note.nodeId}`, audioFileUrl(mirror, row.slug, file)]] : [];
    })
  );
  return { slug: row.slug, publishedAt: row.publishedAt.toISOString(), document, noteAudio, evals: courseEvals(document, row.dossier) };
}

/** Each of the course's moves' evaluation and quality, from its engine pass
 * (`{}` without one): the player's eval bar and graph, the board sounds. */
export function courseEvals(document: CourseDocument, dossier: CourseDossier | null): PublicCourseResponse['evals'] {
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  return Object.fromEntries((dossier?.nodes ?? []).filter((facts) => nodeIds.has(facts.nodeId)).map((facts) => [facts.nodeId, { cp: facts.evalAfterCp, quality: facts.quality }]));
}

/** One note's audio file, only while a note of the published copy says it. */
export async function publicNoteAudio(db: Kysely<Database>, slug: string, file: string): Promise<courseAudioRepo.CourseAudio> {
  const content = AUDIO_FILE.exec(file)?.[1];
  const row = content ? await coursesRepo.findPublishedBySlug(db, slug) : undefined;
  if (!content || !row?.publishedDocument) throw new NotFoundError('No such note audio');
  const audio = await courseAudioRepo.findByContent(db, row.id, content);
  const document = CourseDocumentSchema.parse(row.publishedDocument);
  if (!audio || !noteHashes(document).some((note) => note.hash === audio.textHash)) throw new NotFoundError('No such note audio');
  return { mimeType: audio.mimeType, bytes: audio.bytes };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Postgres's text for a timestamptz: `2026-02-01 00:00:00.123456+00`. */
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-]\d{2}(?::\d{2})?$/;

/** docs/courses.md §9: one page of the catalogue. The cursor is the last
 * row's published time (to the microsecond) and id, so a course published
 * meanwhile neither repeats nor skips a row. */
export async function courseCatalogue(db: Kysely<Database>, query: CourseCatalogQuery): Promise<CourseCatalogResponse> {
  const curriculum = query.sort === 'curriculum';
  // Curriculum order has no stable key to page after, so it pages by position.
  const offset = curriculum && query.cursor ? decodeOffset(query.cursor) : 0;
  const rows = await coursesRepo.listPublic(db, {
    kind: query.kind,
    sort: query.sort,
    offset,
    before: !curriculum && query.cursor ? decodeCursor(query.cursor) : undefined,
    limit: query.limit + 1
  });
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) =>
      CourseCatalogItemSchema.parse({
        slug: row.slug,
        title: row.title,
        promise: row.promise ?? '',
        kind: row.kind,
        levelBand: row.levelBand,
        coachPersona: row.coachPersona,
        learnerSide: row.learnerSide,
        publishedAt: row.publishedAt.toISOString(),
        episodes: row.episodes,
        moves: row.moves,
        level: row.level ?? null
      })
    ),
    nextCursor:
      rows.length > query.limit && last
        ? Buffer.from(curriculum ? `o:${offset + query.limit}` : `${last.cursorAt}|${last.id}`).toString('base64url')
        : null
  };
}

function decodeOffset(cursor: string): number {
  const match = /^o:(\d{1,6})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!match) throw new ValidationError('Not a catalogue cursor');
  return Number(match[1]);
}

function decodeCursor(cursor: string): { cursorAt: string; id: string } {
  const [cursorAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!cursorAt || !id || !UUID.test(id) || !PG_TIMESTAMP.test(cursorAt)) throw new ValidationError('Not a catalogue cursor');
  return { cursorAt, id };
}
