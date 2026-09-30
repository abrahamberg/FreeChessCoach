/** A node as far as the tree shape goes. */
export interface CoursePathNode {
  id: string;
  parentId: string | null;
}

/** Root to `nodeId`, inclusive; empty when the node does not exist. */
export function courseNodeAncestry<T extends CoursePathNode>(byId: ReadonlyMap<string, T>, nodeId: string): T[] {
  const path: T[] = [];
  for (let node = byId.get(nodeId); node; node = node.parentId ? byId.get(node.parentId) : undefined) path.unshift(node);
  return path;
}

/** The ids from `startId` to `endId` along the tree, or null when the start
 * is not on the way to the end. */
export function courseNodePath(nodes: readonly CoursePathNode[], startId: string, endId: string): string[] | null {
  const ancestry = courseNodeAncestry(new Map(nodes.map((node) => [node.id, node])), endId);
  const startAt = ancestry.findIndex((node) => node.id === startId);
  return startAt < 0 ? null : ancestry.slice(startAt).map((node) => node.id);
}
