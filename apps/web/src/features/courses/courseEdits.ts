import type { CourseDocument, CourseEpisode, CourseNode, CoursePly } from '@freechesscoach/shared';

/** Pure edits of a draft; the editor keeps the whole document in state. */
export function updateEpisode(document: CourseDocument, episodeId: string, edit: (episode: CourseEpisode) => CourseEpisode): CourseDocument {
  return { ...document, episodes: document.episodes.map((episode) => (episode.id === episodeId ? edit(episode) : episode)) };
}

/** Changes one move's entry, creating it when the move has none (speaking
 * in the course, since the creator is writing for it). `order` is the
 * episode's moves, so a new entry lands in move order. */
export function setPly(episode: CourseEpisode, nodeId: string, patch: Partial<Omit<CoursePly, 'nodeId'>>, order: readonly string[] = []): CourseEpisode {
  if (episode.plies.some((ply) => ply.nodeId === nodeId)) {
    return { ...episode, plies: episode.plies.map((ply) => (ply.nodeId === nodeId ? { ...ply, ...patch } : ply)) };
  }
  const created: CoursePly = { nodeId, text: '', arrows: [], course: true, video: false, ...patch };
  const at = (id: string): number => (order.includes(id) ? order.indexOf(id) : Number.MAX_SAFE_INTEGER);
  return { ...episode, plies: [...episode.plies, created].sort((a, b) => at(a.nodeId) - at(b.nodeId)) };
}

export function withoutQuiz(episode: CourseEpisode): CourseEpisode {
  const next = { ...episode };
  delete next.quiz;
  return next;
}

/** The episode's moves, start to end along the tree; just the end node
 * when the start is not one of its ancestors. */
export function episodeNodeIds(document: CourseDocument, episode: CourseEpisode): string[] {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  const path: string[] = [];
  for (let node = byId.get(episode.endNodeId); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node.id);
    if (node.id === episode.startNodeId) return path;
  }
  return [episode.endNodeId];
}

/** The node with this id, if the document has it. */
export function findNode(document: CourseDocument, nodeId: string | null | undefined): CourseNode | undefined {
  return nodeId ? document.nodes.find((candidate) => candidate.id === nodeId) : undefined;
}

/** The position a node's move is played from. */
export function fenBefore(document: CourseDocument, node: CourseNode): string {
  const parent = findNode(document, node.parentId);
  return parent?.fenAfter ?? document.startFen;
}

/** "6.Bc3" / "6…Bb4", read off the position before the move. */
export function moveLabel(document: CourseDocument, node: CourseNode): string {
  const [, turn, , , , fullmove] = fenBefore(document, node).split(' ');
  return `${fullmove ?? '1'}${turn === 'b' ? '…' : '.'}${node.san}`;
}
