import type { EditableTree } from '@freechesscoach/chess-analysis';

/** The positions a live review still has to look at, in the order to do
 * them: the move on the board first (its position before and after), then
 * the move played last, then the moves in between, nearest to the board
 * first. The start position leads when the board is on it. `include` limits
 * the moves in between (a game that already has its analysis keeps it). */
export function reviewOrder(tree: EditableTree, currentId: string | null, latestId: string | null, include: (nodeId: string) => boolean = () => true): string[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const depth = (id: string): number => {
    let count = 0;
    for (let node = byId.get(id); node; node = node.parentId === null ? undefined : byId.get(node.parentId)) count += 1;
    return count;
  };
  const here = currentId === null ? 0 : depth(currentId);
  const rest = tree.nodes
    .map((node) => node.id)
    .filter((id) => id !== currentId && id !== latestId && include(id))
    .sort((a, b) => Math.abs(depth(a) - here) - Math.abs(depth(b) - here));
  const ids = [currentId, latestId, ...rest].filter((id): id is string => id !== null && byId.has(id));
  const fens: string[] = currentId === null ? [tree.startFen] : [];
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) continue;
    const parent = node.parentId === null ? undefined : byId.get(node.parentId);
    fens.push(parent?.fenAfter ?? tree.startFen, node.fenAfter);
  }
  return [...new Set(fens)];
}

/** The newest move the learner added (`x` ids count up), which the review
 * does right after the one on the board. */
export function latestNodeId(tree: EditableTree): string | null {
  const id = `x${(tree.nextExtraId ?? 1) - 1}`;
  return tree.nodes.some((node) => node.id === id) ? id : null;
}

/** The moves the learner made, as opposed to the game's own (`n` ids). */
export function isLearnerMove(nodeId: string): boolean {
  return nodeId.startsWith('x');
}
