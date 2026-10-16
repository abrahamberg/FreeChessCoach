import { allowsSeveralStarts, type CourseKind } from '@freechesscoach/shared';
import { parsePgnTree, type PgnArrow, type PgnGlyph, type PgnMark, type PgnTreeError, type PgnTreeNode, type PgnTreeOptions } from '../pgn-tree/parse.js';

export type { PgnArrow as CourseTreeArrow, PgnTreeError as CourseTreeError } from '../pgn-tree/parse.js';

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
  arrows: PgnArrow[];
  /** The creator's `@key`, `@quiz` … on the move, with its section's pace. */
  marks: PgnMark[];
  glyph: PgnGlyph | null;
  /** On a root node of a tree read with `allGames`: the position its example starts from. */
  startFen?: string;
}

export interface CourseTreeLine {
  id: string;
  name: string;
  /** What the creator's section note says the line is for; null without one. */
  note: string | null;
  leafNodeId: string;
}

export interface CourseTree {
  startFen: string;
  nodes: CourseTreeNode[];
  lines: CourseTreeLine[];
  errors: PgnTreeError[];
}

/**
 * Parses the first game of a PGN, variations included, into a move tree for a
 * course (docs/courses.md §4): `parsePgnTree` plus the lines, one per leaf.
 * Ids depend only on the PGN text, so parsing the same PGN twice gives the
 * same ids.
 */
export function parseCourseTree(pgn: string, options: PgnTreeOptions = {}): CourseTree {
  const tree = parsePgnTree(pgn, options);
  const { nodes, lines } = withLines(tree.nodes);
  return { startFen: tree.startFen, nodes, lines, errors: tree.errors };
}

/** The tree of a course's PGN: a lesson or tactics course reads every game
 * (each example starts from its own `[FEN]`), the other kinds the first. */
export function parseCourseTreeOfKind(pgn: string, kind: CourseKind): CourseTree {
  return parseCourseTree(pgn, { allGames: allowsSeveralStarts(kind) });
}

function withLines(treeNodes: PgnTreeNode[]): { nodes: CourseTreeNode[]; lines: CourseTreeLine[] } {
  const firstChild = new Map<string, string>();
  for (const node of treeNodes) if (node.parentId && !firstChild.has(node.parentId)) firstChild.set(node.parentId, node.id);
  const leaves = treeNodes.filter((node) => !firstChild.has(node.id));
  const lineIdByLeaf = new Map(leaves.map((leaf, index) => [leaf.id, `l${index + 1}`]));
  const leafOf = (id: string): string => {
    let current = id;
    for (let next = firstChild.get(current); next; next = firstChild.get(current)) current = next;
    return current;
  };
  const { names, notes } = describedLeaves(treeNodes, leafOf);
  const lines = leaves.map((leaf, index) => ({ id: `l${index + 1}`, name: names.get(leaf.id) ?? `Line ${lineLetter(index)}`, note: notes.get(leaf.id) ?? null, leafNodeId: leaf.id }));
  const nodes = treeNodes.map(({ id, parentId, san, uci, fenAfter, comment, arrows, marks, glyph, startFen }) => ({
    id,
    parentId,
    san,
    uci,
    fenAfter,
    // The first line through a node keeps to main continuations from there,
    // because leaves are numbered in pre-order.
    lineId: lineIdByLeaf.get(leafOf(id)) ?? 'l1',
    comment,
    arrows,
    marks,
    glyph,
    ...(startFen === undefined ? {} : { startFen })
  }));
  return { nodes, lines };
}

/** A named (or noted) variation names (or notes) the line that follows its
 * main continuation. */
function describedLeaves(nodes: PgnTreeNode[], leafOf: (id: string) => string): { names: Map<string, string>; notes: Map<string, string> } {
  const names = new Map<string, string>();
  const notes = new Map<string, string>();
  for (const node of nodes) {
    const leaf = leafOf(node.id);
    if (node.branchName && !names.has(leaf)) names.set(leaf, node.branchName);
    if (node.branchNote && !notes.has(leaf)) notes.set(leaf, node.branchNote);
  }
  return { names, notes };
}

function lineLetter(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${lineLetter(Math.floor(index / 26) - 1)}${letter}`;
}
