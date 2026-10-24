import { Chess } from 'chess.js';
import type { PgnTree, PgnTreeNode } from './parse.js';

/** A tree that can be edited. `nextExtraId` counts the `x` ids handed out, so
 * an id is never reused after its branch is removed. */
export type EditableTree = PgnTree & { nextExtraId?: number };

export type AddMoveResult =
  | { ok: true; tree: EditableTree; nodeId: string; added: boolean }
  | { ok: false; error: string };

/** A tree of one line: the moves in order from `startFen`, ids `x1`, `x2` …
 * The moves are trusted to be legal (an illegal one ends the line). */
export function lineTree(startFen: string, sanMoves: string[]): EditableTree {
  let tree: EditableTree = { startFen, nodes: [], errors: [] };
  let parentId: string | null = null;
  for (const san of sanMoves) {
    const result = addMove(tree, parentId, san);
    if (!result.ok) break;
    tree = result.tree;
    parentId = result.nodeId;
  }
  return tree;
}

/** Plays `san` from the position after `parentId` (null = the start). The
 * existing child is returned when the move is already there; a new move
 * becomes the parent's last child. chess.js decides legality. */
export function addMove(tree: EditableTree, parentId: string | null, san: string): AddMoveResult {
  const parent = parentId === null ? null : tree.nodes.find((node) => node.id === parentId);
  if (parent === undefined) return { ok: false, error: `No such node: ${parentId}` };
  const chess = new Chess(parent?.fenAfter ?? tree.startFen);
  let move;
  try {
    move = chess.move(san);
  } catch {
    return { ok: false, error: `Illegal move ${san}` };
  }
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  const existing = childrenOf(tree, parentId).find((child) => child.uci === uci);
  if (existing) return { ok: true, tree, nodeId: existing.id, added: false };

  const next = tree.nextExtraId ?? nextExtraIdOf(tree);
  const node: PgnTreeNode = {
    id: `x${next}`, parentId, san: move.san, uci, fenAfter: chess.fen(),
    comment: null, arrows: [], branchName: null, branchNote: null, glyph: null, marks: []
  };
  // Pre-order: the new last child follows the parent's whole subtree.
  const nodes = [...tree.nodes];
  const at = parent ? lastIndexInSubtree(tree, parent.id) + 1 : nodes.length;
  nodes.splice(at, 0, node);
  return { ok: true, tree: { ...tree, nodes, nextExtraId: next + 1 }, nodeId: node.id, added: true };
}

/** The node and everything after it. */
export function removeBranch(tree: EditableTree, nodeId: string): EditableTree {
  const gone = descendantIds(tree, nodeId);
  return { ...tree, nodes: tree.nodes.filter((node) => !gone.has(node.id)), nextExtraId: tree.nextExtraId ?? nextExtraIdOf(tree) };
}

/** Makes the branch holding `nodeId` the main line: at every point on the way
 * back to the start where it is a later alternative, it moves ahead of the
 * moves that were first. Nothing is removed. */
export function promoteBranch(tree: EditableTree, nodeId: string): EditableTree {
  let nodes = [...tree.nodes];
  let current = nodes.find((node) => node.id === nodeId);
  while (current) {
    const here: PgnTreeNode = current;
    const first = nodes.find((node) => node.parentId === here.parentId);
    if (first && first.id !== here.id) {
      const moving = descendantIds({ ...tree, nodes }, here.id);
      const block = nodes.filter((node) => moving.has(node.id));
      const rest = nodes.filter((node) => !moving.has(node.id));
      const at = rest.findIndex((node) => node.id === first.id);
      nodes = [...rest.slice(0, at), ...block, ...rest.slice(at)];
    }
    current = here.parentId === null ? undefined : nodes.find((node) => node.id === here.parentId);
  }
  return { ...tree, nodes };
}

/** The first move, then each node's first child. */
export function mainLine(tree: PgnTree): PgnTreeNode[] {
  const line: PgnTreeNode[] = [];
  let next = childrenOf(tree, null)[0];
  while (next) {
    line.push(next);
    next = childrenOf(tree, next.id)[0];
  }
  return line;
}

/** The main line without the moves made in the explorer (`x` ids): the game
 * itself. A move explored from the game's last position is the first child of
 * that node, but it is a variation, not a longer game. */
export function gameLine(tree: PgnTree): PgnTreeNode[] {
  const line = mainLine(tree);
  const end = line.findIndex((node) => node.id.startsWith('x'));
  return end === -1 ? line : line.slice(0, end);
}

/** The moves from the start to `nodeId`, inclusive; empty for an unknown id. */
export function pathTo(tree: PgnTree, nodeId: string): PgnTreeNode[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const path: PgnTreeNode[] = [];
  for (let node = byId.get(nodeId); node; node = node.parentId === null ? undefined : byId.get(node.parentId)) path.unshift(node);
  return path;
}

export function childrenOf(tree: PgnTree, parentId: string | null): PgnTreeNode[] {
  return tree.nodes.filter((node) => node.parentId === parentId);
}

function descendantIds(tree: PgnTree, nodeId: string): Set<string> {
  const ids = new Set<string>();
  if (!tree.nodes.some((node) => node.id === nodeId)) return ids;
  ids.add(nodeId);
  // Pre-order: a node's parent always comes before it.
  for (const node of tree.nodes) if (node.parentId !== null && ids.has(node.parentId)) ids.add(node.id);
  return ids;
}

function lastIndexInSubtree(tree: PgnTree, nodeId: string): number {
  const ids = descendantIds(tree, nodeId);
  let last = -1;
  tree.nodes.forEach((node, index) => { if (ids.has(node.id)) last = index; });
  return last;
}

function nextExtraIdOf(tree: PgnTree): number {
  let max = 0;
  for (const node of tree.nodes) {
    const match = /^x(\d+)$/.exec(node.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
