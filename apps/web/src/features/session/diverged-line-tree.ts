import { childrenOf, gameLine, pathTo, type PgnTree } from '@freechesscoach/chess-analysis';

export interface DivergedMove {
  san: string;
  fen: string;
  uci: string;
}

/** What the coach is told about the line the student is exploring. */
export interface DivergedLineState {
  basePly: number;
  baseFen: string;
  moves: DivergedMove[];
}

/** The node the current variation branches from: the last main-line node on
 * the way to `nodeId` (null = the game's start). */
function branchPoint(tree: PgnTree, nodeId: string): { index: number; ply: number } {
  const mainIds = new Set(gameLine(tree).map((node) => node.id));
  const path = pathTo(tree, nodeId);
  let index = -1;
  path.forEach((node, at) => { if (mainIds.has(node.id)) index = at; });
  return { index, ply: index + 1 };
}

/** The variation the node is in, as the coach is told about it: where it
 * branches off the game, and every move of it from there to its end (the
 * first-move chain after the node included). Null for a node on the game's
 * own line. `stepIndex` is how many of those moves are played to reach the node. */
export function divergedLineOf(tree: PgnTree, nodeId: string | null): { line: DivergedLineState; stepIndex: number } | null {
  if (nodeId === null) return null;
  const mainIds = new Set(gameLine(tree).map((node) => node.id));
  if (mainIds.has(nodeId) || !tree.nodes.some((node) => node.id === nodeId)) return null;

  const path = pathTo(tree, nodeId);
  const { index } = branchPoint(tree, nodeId);
  const nodes = [...path.slice(index + 1)];
  for (let next = childrenOf(tree, nodeId)[0]; next; next = childrenOf(tree, next.id)[0]) nodes.push(next);
  const anchor = index >= 0 ? path[index] : undefined;
  return {
    line: {
      basePly: index + 1,
      baseFen: anchor?.fenAfter ?? tree.startFen,
      moves: nodes.map((node) => ({ san: node.san, fen: node.fenAfter, uci: node.uci }))
    },
    stepIndex: path.length - 1 - index
  };
}
