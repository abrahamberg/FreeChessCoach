import type { CourseDocument, CourseEpisode, CourseNode } from '@freechesscoach/shared';

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

/** Where the course pays off: the end of the main line. A hook episode shows this board. */
export function climaxNode(document: CourseDocument): CourseNode | undefined {
  return findNode(document, document.lines[0]?.leafNodeId);
}

/** The node with this id, if the document has it. */
export function findNode(document: CourseDocument, nodeId: string | null | undefined): CourseNode | undefined {
  return nodeId ? document.nodes.find((candidate) => candidate.id === nodeId) : undefined;
}

/** The position a node's move is played from. */
export function fenBefore(document: CourseDocument, node: CourseNode): string {
  const parent = findNode(document, node.parentId);
  return parent?.fenAfter ?? node.startFen ?? document.startFen;
}
