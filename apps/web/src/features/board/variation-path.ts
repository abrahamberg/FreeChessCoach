import { childrenOf, gameLine, pathTo, type PgnTree } from '@freechesscoach/chess-analysis';

/** The one line the phone's move strip shows: the moves from the start to the
 * current node, then on along first moves to the end of that line. When the
 * current node is in a variation, the strip is the game up to the branch and
 * then the variation. */
export interface StripPath {
  nodeIds: string[];
  sanMoves: string[];
  /** ply-indexed (ply 0 = the start). */
  positions: { ply: number; fen: string }[];
  /** 1-based, like every ply: how many strip moves are played to reach the current node. */
  ply: number;
  /** The strip index (0-based) where the variation starts, or null on the game's own line. */
  variationFromIndex: number | null;
}

export function stripPath(tree: PgnTree, currentId: string | null): StripPath {
  const upTo = currentId === null ? [] : pathTo(tree, currentId);
  const nodes = [...upTo];
  for (let next = childrenOf(tree, upTo.at(-1)?.id ?? null)[0]; next; next = childrenOf(tree, next.id)[0]) nodes.push(next);
  const mainIds = new Set(gameLine(tree).map((node) => node.id));
  const firstOff = nodes.findIndex((node) => !mainIds.has(node.id));
  return {
    nodeIds: nodes.map((node) => node.id),
    sanMoves: nodes.map((node) => node.san),
    positions: [{ ply: 0, fen: tree.startFen }, ...nodes.map((node, index) => ({ ply: index + 1, fen: node.fenAfter }))],
    ply: upTo.length,
    variationFromIndex: firstOff === -1 ? null : firstOff
  };
}
