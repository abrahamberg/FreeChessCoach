import { Chess } from 'chess.js';
import type { CourseTree, CourseTreeNode } from './course-tree.js';
import type { ParsedGame, ParsedPosition } from './pgn.js';

const DEFAULT_FEN = new Chess().fen();

export interface CourseLineGame {
  lineId: string;
  /** Node ids root to leaf; `nodeIds[i]` is the move of `game.positions[i + 1]`. */
  nodeIds: string[];
  game: ParsedGame;
  /** A one-game PGN of the line, with a [FEN] header when the tree has one. */
  pgn: string;
}

/** Root-to-leaf node path of each line, so a line can run through the
 * whole-game analysis steps as if it were a game. */
export function courseLineGames(tree: CourseTree): CourseLineGame[] {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  return tree.lines.map((line) => {
    const path = pathTo(byId, line.leafNodeId);
    return { lineId: line.id, nodeIds: path.map((node) => node.id), game: lineGame(tree.startFen, path), pgn: linePgn(tree.startFen, path) };
  });
}

/** Every distinct position in the tree (start first), each evaluated once. */
export function courseTreeFens(tree: CourseTree): string[] {
  return [...new Set([tree.startFen, ...tree.nodes.map((node) => node.fenAfter)])];
}

function pathTo(byId: ReadonlyMap<string, CourseTreeNode>, leafId: string): CourseTreeNode[] {
  const path: CourseTreeNode[] = [];
  for (let node = byId.get(leafId); node; node = node.parentId ? byId.get(node.parentId) : undefined) path.unshift(node);
  return path;
}

function lineGame(startFen: string, path: CourseTreeNode[]): ParsedGame {
  const positions: ParsedPosition[] = [{ ply: 0, fen: startFen, moveSan: null, moveUci: null, mover: null }];
  let fenBefore = startFen;
  path.forEach((node, index) => {
    const mover = fenBefore.split(' ')[1] === 'b' ? 'black' : 'white';
    positions.push({ ply: index + 1, fen: node.fenAfter, moveSan: node.san, moveUci: node.uci, mover });
    fenBefore = node.fenAfter;
  });
  const headers: Record<string, string> = startFen === DEFAULT_FEN ? {} : { SetUp: '1', FEN: startFen };
  return { headers, positions };
}

function linePgn(startFen: string, path: CourseTreeNode[]): string {
  const chess = new Chess(startFen);
  for (const node of path) chess.move(node.san);
  return chess.pgn();
}
