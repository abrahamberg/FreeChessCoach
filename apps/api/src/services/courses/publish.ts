import { moveLabel, verifyCourseEpisode } from '@freechesscoach/chess-analysis';
import type { CourseCheckProblem, CourseDocument, CourseResponse, PublishCheckResponse, PublishCourseRequest } from '@freechesscoach/shared';
import type { Kysely } from 'kysely';
import * as courseAudioRepo from '../../db/repositories/course-audio.js';
import * as coursesRepo from '../../db/repositories/courses.js';
import type { Database } from '../../db/schema.js';
import { ConflictError, ValidationError } from '../../lib/errors.js';
import { ownedCourse, storedDocument, toCourseResponse } from './course-drafts.js';
import type { AudioStore } from './audio-store.js';
import { noteHashes } from './note-audio.js';

/** What must be there before anything is published (docs/courses.md §4, §9). */
export function publishBlockers(document: CourseDocument): string[] {
  const blockers: string[] = [];
  if (!document.title.trim()) blockers.push('Give the course a title');
  if (!document.episodes.some((episode) => episode.plies.some((ply) => (ply.course || ply.video) && ply.text.trim()))) blockers.push('Write the course first');
  if (document.takeaways.filter((takeaway) => takeaway.trim()).length !== 3) blockers.push('Write the three takeaways');
  return blockers;
}

/** The verifier's problems over the whole draft, with the engine facts when
 * the course has them (§7), each with its episode and move. */
export function draftCheckProblems(document: CourseDocument, row: coursesRepo.CourseRow): CourseCheckProblem[] {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const moveOf = (nodeId: string | null): string | null => {
    const node = nodeId ? byId.get(nodeId) : undefined;
    if (!node) return null;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    return moveLabel(parent ? parent.fenAfter : document.startFen, node.san);
  };
  return document.episodes.flatMap((episode) =>
    verifyCourseEpisode({ episode, startFen: document.startFen, nodes: document.nodes, dossier: row.dossier, direction: row.direction }).map((problem) => ({
      episodeId: episode.id,
      episode: episode.role,
      nodeId: problem.nodeId,
      move: moveOf(problem.nodeId),
      message: problem.message
    }))
  );
}

/** §9: what publishing would be refused for, read before the notes are voiced. */
export async function publishCheck(db: Kysely<Database>, ownerId: string, id: string): Promise<PublishCheckResponse> {
  const row = await ownedCourse(db, ownerId, id);
  return { problems: draftCheckProblems(storedDocument(row), row) };
}

/** §9: copies the draft to the frozen published copy. Refused while the
 * checks report problems, unless the creator ticked "I checked these". Audio
 * that no published note uses any more is dropped, from the bucket too. */
export async function publishCourse(
  db: Kysely<Database>,
  ownerId: string,
  id: string,
  request: Required<PublishCourseRequest>,
  /** The bucket, to clean up dropped files; a failure there never fails the publish. */
  audio?: { store: AudioStore; onError: (error: unknown) => void }
): Promise<CourseResponse> {
  const row = await ownedCourse(db, ownerId, id);
  if (row.status === 'removed') throw new ConflictError('This course was removed by a moderator');
  const document = storedDocument(row);
  const blockers = publishBlockers(document);
  if (blockers.length) throw new ValidationError(blockers.join('; '));
  const problems = draftCheckProblems(document, row);
  if (problems.length && !request.warningsChecked) {
    throw new ConflictError(`The checks found ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}; look at them and tick "I checked these" to publish anyway`);
  }
  const published = await coursesRepo.publish(db, id, ownerId, document, request.visibility);
  const dropped = await courseAudioRepo.keepOnly(db, id, noteHashes(document).map((note) => note.hash));
  if (audio) await Promise.all(dropped.map((key) => audio.store.delete(key).catch(audio.onError)));
  return toCourseResponse(db, published);
}
