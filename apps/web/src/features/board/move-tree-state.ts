import { addMove, childrenOf, lineTree, gameLine, parsePgnTree, pathTo, promoteBranch, removeBranch, type EditableTree } from '@freechesscoach/chess-analysis';

/** The explorer's state: a move tree and the node on the board (null = the
 * start). The tree's own nodes are never removed or reordered; moves the
 * student adds get `x` ids and can be removed. */
export interface MoveTreeState {
  tree: EditableTree;
  currentId: string | null;
}

export function initialMoveTree(tree: EditableTree, currentId: string | null = null): MoveTreeState {
  return { tree, currentId };
}

/** The game's tree: the PGN's own variations when its main line is the game
 * the analysis was made for, otherwise just the line itself. Its nodes have
 * `n` ids either way, so none of them can be removed. */
export function gameTree(startFen: string, sanMoves: string[], pgn: string): EditableTree {
  const parsed = parsePgnTree(pgn);
  const parsedMain = gameLine(parsed).map((node) => node.san);
  const sameGame = parsed.errors.length === 0 && parsed.startFen === startFen && parsedMain.length === sanMoves.length && parsedMain.every((san, index) => san === sanMoves[index]);
  if (sameGame) return parsed;
  return lineGameTree(startFen, sanMoves);
}

/** A game that is only its line: nodes `n1`, `n2` … in move order, so node `n<k>` is ply k. */
export function lineGameTree(startFen: string, sanMoves: string[]): EditableTree {
  const line = lineTree(startFen, sanMoves);
  return { ...line, nodes: line.nodes.map((node) => ({ ...node, id: toGameId(node.id), parentId: node.parentId && toGameId(node.parentId) })), nextExtraId: 1 };
}

function toGameId(id: string): string {
  return `n${id.slice(1)}`;
}

/** Plays `san` from the current node: follows the move when it is already
 * there, adds it as a variation otherwise. Null for an illegal move. */
export function play(state: MoveTreeState, san: string): MoveTreeState | null {
  const result = addMove(state.tree, state.currentId, san);
  return result.ok ? { tree: result.tree, currentId: result.nodeId } : null;
}

export function select(state: MoveTreeState, nodeId: string | null): MoveTreeState {
  if (nodeId !== null && !state.tree.nodes.some((node) => node.id === nodeId)) return state;
  return { ...state, currentId: nodeId };
}

export function isMainNode(tree: EditableTree, nodeId: string): boolean {
  return gameLine(tree).some((node) => node.id === nodeId);
}

/** To the last node of the main line on the way to the current one (the node
 * itself when it is on the main line). */
export function back(state: MoveTreeState): MoveTreeState {
  return { ...state, currentId: lastMainNodeOnPath(state.tree, state.currentId) };
}

/** Removes a variation the student made, with everything after it; the
 * current node moves to the removed branch's parent when it was inside.
 * Nodes of the game itself stay. */
export function remove(state: MoveTreeState, nodeId: string): MoveTreeState {
  if (!nodeId.startsWith('x')) return state;
  const node = state.tree.nodes.find((each) => each.id === nodeId);
  if (!node) return state;
  const insideCurrent = state.currentId !== null && pathTo(state.tree, state.currentId).some((each) => each.id === nodeId);
  return { tree: removeBranch(state.tree, nodeId), currentId: insideCurrent ? node.parentId : state.currentId };
}

/** Makes the branch holding `nodeId` the main line; the board stays where it is. */
export function promote(state: MoveTreeState, nodeId: string): MoveTreeState {
  return state.tree.nodes.some((node) => node.id === nodeId) ? { ...state, tree: promoteBranch(state.tree, nodeId) } : state;
}

/** The ply of the game the node is on, or branches from: the number of
 * main-line moves on the way to it. */
export function anchorPly(tree: EditableTree, nodeId: string | null): number {
  const anchor = lastMainNodeOnPath(tree, nodeId);
  return anchor === null ? 0 : pathTo(tree, anchor).length;
}

/** The main-line node for a ply (null = the start). */
export function mainNodeAtPly(tree: EditableTree, ply: number): string | null {
  return ply <= 0 ? null : (gameLine(tree)[ply - 1]?.id ?? null);
}

/** Qualities keyed by main-line node id, from their 1-based plies. */
export function qualitiesByMainNode<T extends { ply: number }>(tree: EditableTree, moves: T[]): Record<string, T> {
  const line = gameLine(tree);
  const entries: [string, T][] = [];
  for (const move of moves) {
    const node = line[move.ply - 1];
    if (node) entries.push([node.id, move]);
  }
  return Object.fromEntries(entries);
}

export function firstChildId(tree: EditableTree, nodeId: string | null): string | null {
  return childrenOf(tree, nodeId)[0]?.id ?? null;
}

function lastMainNodeOnPath(tree: EditableTree, nodeId: string | null): string | null {
  if (nodeId === null) return null;
  const mainIds = new Set(gameLine(tree).map((node) => node.id));
  const path = pathTo(tree, nodeId);
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const node = path[index];
    if (node && mainIds.has(node.id)) return node.id;
  }
  return null;
}
