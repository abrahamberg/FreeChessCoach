import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { CourseTreeArrow } from './course-pgn-comment.js';
import { tokenizeCoursePgn } from './course-pgn-tokens.js';
import { buildDraftTree, type CourseTreeError, type DraftNode, type DraftRoot } from './course-tree-build.js';
import { extractFirstGame } from './pgn.js';

export type { CourseTreeArrow } from './course-pgn-comment.js';
export type { CourseTreeError } from './course-tree-build.js';

export interface CourseTreeNode {
  /** `n1`, `n2` … in pre-order, main continuation first. */
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fenAfter: string;
  /** The first line (in `lines` order) that passes through this node. */
  lineId: string;
  comment: string | null;
  arrows: CourseTreeArrow[];
}

export interface CourseTreeLine {
  id: string;
  name: string;
  leafNodeId: string;
}

export interface CourseTree {
  startFen: string;
  nodes: CourseTreeNode[];
  lines: CourseTreeLine[];
  errors: CourseTreeError[];
}

const HEADER_LINE = /^\s*\[(\w+)\s+"([^"]*)"\]\s*$/;

/**
 * Parses the first game of a PGN, variations included, into a move tree for a
 * course (docs/courses.md §4). Game import keeps `parsePgn`, which reads the
 * main line only. Ids depend only on the PGN text, so parsing the same PGN
 * twice gives the same ids.
 */
export function parseCourseTree(pgn: string): CourseTree {
  const { fenHeader, movetext } = splitHeaders(extractFirstGame(pgn));
  const errors: CourseTreeError[] = [];
  const startFen = resolveStartFen(fenHeader, errors);
  const built = buildDraftTree(startFen, tokenizeCoursePgn(movetext, 1));
  const { nodes, lines } = flattenTree(built.root);
  return { startFen, nodes, lines, errors: [...errors, ...built.errors] };
}

/** Header lines are blanked, not removed, so PGN line numbers stay right. */
function splitHeaders(text: string): { fenHeader: string | null; movetext: string } {
  let fenHeader: string | null = null;
  const lines = text.split('\n').map((line) => {
    const match = HEADER_LINE.exec(line);
    if (!match) return line;
    if (match[1] === 'FEN') fenHeader = match[2] ?? null;
    return '';
  });
  return { fenHeader, movetext: lines.join('\n') };
}

function resolveStartFen(fenHeader: string | null, errors: CourseTreeError[]): string {
  if (!fenHeader) return DEFAULT_POSITION;
  try {
    return new Chess(fenHeader).fen();
  } catch {
    errors.push({ message: `Invalid [FEN] header: ${fenHeader}`, pgnLine: 1, san: null, moveNumber: null, side: null });
    return DEFAULT_POSITION;
  }
}

interface Visit {
  node: DraftNode;
  id: string;
  parentId: string | null;
}

function flattenTree(root: DraftRoot): { nodes: CourseTreeNode[]; lines: CourseTreeLine[] } {
  const visits = preOrder(root);
  const leaves = visits.filter((visit) => visit.node.children.length === 0);
  const lineIdByLeaf = new Map(leaves.map((visit, index) => [visit.node, `l${index + 1}`]));
  const namesByLeaf = namedLeaves(visits);
  const lines = leaves.map((visit, index) => ({
    id: `l${index + 1}`,
    name: namesByLeaf.get(visit.node) ?? `Line ${lineLetter(index)}`,
    leafNodeId: visit.id
  }));
  const nodes = visits.map((visit) => toCourseNode(visit, lineIdByLeaf.get(firstLeaf(visit.node)) ?? 'l1'));
  return { nodes, lines };
}

function preOrder(root: DraftRoot): Visit[] {
  const visits: Visit[] = [];
  const walk = (node: DraftNode, parentId: string | null): void => {
    const id = `n${visits.length + 1}`;
    visits.push({ node, id, parentId });
    for (const child of node.children) walk(child, id);
  };
  for (const child of root.children) walk(child, null);
  return visits;
}

/** A named variation names the line that follows its main continuation. */
function namedLeaves(visits: Visit[]): Map<DraftNode, string> {
  const names = new Map<DraftNode, string>();
  for (const { node } of visits) {
    const leaf = firstLeaf(node);
    if (node.branchName && !names.has(leaf)) names.set(leaf, node.branchName);
  }
  return names;
}

/** The first line through a node is the one that keeps to main continuations
 * from there, because leaves are numbered in pre-order. */
function firstLeaf(node: DraftNode): DraftNode {
  let current = node;
  while (current.children[0]) current = current.children[0];
  return current;
}

function lineLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${lineLetter(Math.floor(index / 26) - 1)}${letter}`;
}

function toCourseNode(visit: Visit, lineId: string): CourseTreeNode {
  const { san, uci, fenAfter, comment, arrows } = visit.node;
  return { id: visit.id, parentId: visit.parentId, san, uci, fenAfter, lineId, comment, arrows };
}
