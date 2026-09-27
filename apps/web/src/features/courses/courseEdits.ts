import type { CourseArrow, CourseBeat, CourseDocument, CourseEpisode, CourseNode } from '@freechesscoach/shared';

/** Pure edits of a draft; the editor keeps the whole document in state. */
export function updateEpisode(document: CourseDocument, episodeId: string, edit: (episode: CourseEpisode) => CourseEpisode): CourseDocument {
  return { ...document, episodes: document.episodes.map((episode) => (episode.id === episodeId ? edit(episode) : episode)) };
}

/** Creates the node's note when it has none. */
export function setNote(episode: CourseEpisode, nodeId: string, patch: { text?: string; arrows?: CourseArrow[] }): CourseEpisode {
  const existing = episode.notes.find((note) => note.nodeId === nodeId);
  if (!existing) return { ...episode, notes: [...episode.notes, { nodeId, text: patch.text ?? '', arrows: patch.arrows ?? [] }] };
  return { ...episode, notes: episode.notes.map((note) => (note.nodeId === nodeId ? { ...note, ...patch } : note)) };
}

export function addBeat(episode: CourseEpisode, nodeId: string | null): CourseEpisode {
  return { ...episode, beats: [...episode.beats, { nodeId, say: '', caption: '', arrows: [] }] };
}

export function updateBeat(episode: CourseEpisode, index: number, patch: Partial<CourseBeat>): CourseEpisode {
  return { ...episode, beats: episode.beats.map((beat, at) => (at === index ? { ...beat, ...patch } : beat)) };
}

export function removeBeat(episode: CourseEpisode, index: number): CourseEpisode {
  return { ...episode, beats: episode.beats.filter((_beat, at) => at !== index) };
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

/** The position a node's move is played from. */
export function fenBefore(document: CourseDocument, node: CourseNode): string {
  const parent = node.parentId ? document.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
  return parent?.fenAfter ?? document.startFen;
}

/** "6.Bc3" / "6…Bb4", read off the position before the move. */
export function moveLabel(document: CourseDocument, node: CourseNode): string {
  const [, turn, , , , fullmove] = fenBefore(document, node).split(' ');
  return `${fullmove ?? '1'}${turn === 'b' ? '…' : '.'}${node.san}`;
}
