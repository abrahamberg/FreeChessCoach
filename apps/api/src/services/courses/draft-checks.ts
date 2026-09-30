import type { CourseArrow, CourseDocument, CourseNode } from '@freechesscoach/shared';

/**
 * What a saved draft may not change or break (docs/courses.md §4): the move
 * tree is fixed once parsed — node ids never change, so audio and learner
 * progress stay attached — and every id an episode or chapter names must
 * exist. Returns the first problem, or null.
 */
export function draftProblem(stored: CourseDocument, next: CourseDocument): string | null {
  if (next.kind !== stored.kind) return 'The course kind cannot change';
  if (next.startFen !== stored.startFen || !sameList(next.nodes, stored.nodes, nodeKey)) {
    return 'The move tree cannot change after the course is created';
  }
  if (!sameList(next.lines, stored.lines, (line) => `${line.id}>${line.leafNodeId}`)) {
    return 'Lines can be renamed but not added, removed or moved';
  }
  const nodeIds = new Set(next.nodes.map((node) => node.id));
  const lineIds = new Set(next.lines.map((line) => line.id));
  const episodeIds = new Set(next.episodes.map((episode) => episode.id));
  if (episodeIds.size !== next.episodes.length) return 'Two episodes share an id';
  for (const episode of next.episodes) {
    const named = [
      episode.startNodeId,
      episode.endNodeId,
      ...episode.plies.map((ply) => ply.nodeId),
      ...(episode.quiz ? [episode.quiz.answerNodeId] : []),
      ...episode.drillNodeIds
    ];
    const missing = named.find((id) => !nodeIds.has(id));
    if (missing) return `Episode ${episode.id} names ${missing}, which is not in the move tree`;
  }
  for (const chapter of next.chapters) {
    if (!lineIds.has(chapter.lineId)) return `Chapter "${chapter.title}" names line ${chapter.lineId}, which does not exist`;
    const missing = chapter.episodeIds.find((id) => !episodeIds.has(id));
    if (missing) return `Chapter "${chapter.title}" names episode ${missing}, which does not exist`;
  }
  return null;
}

/** Compared field by field: a stored document comes back from jsonb with
 * its keys reordered, so its JSON text never matches the client's. */
function sameList<T>(a: T[], b: T[], key: (item: T) => string): boolean {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index];
    return other !== undefined && key(item) === key(other);
  });
}

function nodeKey(node: CourseNode): string {
  const arrows = node.arrows.map((arrow: CourseArrow) => `${arrow.from}${arrow.to}${arrow.kind}`).join(',');
  return [node.id, node.parentId, node.san, node.uci, node.fenAfter, node.lineId, node.comment, arrows].join('|');
}
