import { Chess } from 'chess.js';
import { parseCourseComment, type CourseTreeArrow } from './pgn-comment.js';
import type { CoursePgnToken } from './pgn-tokens.js';

/** A tree node before ids and lines are assigned; children[0] is the main
 * continuation (the first move the PGN gave from that position). */
export interface DraftNode {
  san: string;
  uci: string;
  fenAfter: string;
  comment: string | null;
  arrows: CourseTreeArrow[];
  /** A name for the line that continues from this node, from a comment
   * placed before the first move of a variation (or of the game). */
  branchName: string | null;
  children: DraftNode[];
}

export interface DraftRoot {
  fenAfter: string;
  children: DraftNode[];
}

export interface CourseTreeError {
  message: string;
  pgnLine: number;
  san: string | null;
  moveNumber: number | null;
  side: 'white' | 'black' | null;
}

interface Branch {
  /** The node the next move is played from; `parents` is the path to it. */
  current: DraftNode | DraftRoot;
  parents: (DraftNode | DraftRoot)[];
  dead: boolean;
  atStart: boolean;
  pendingName: string | null;
}

/** Plays the tokens from `startFen`, building the move tree. An illegal move
 * is reported and the rest of its branch is skipped. */
export function buildDraftTree(startFen: string, tokens: CoursePgnToken[]): { root: DraftRoot; errors: CourseTreeError[] } {
  const root: DraftRoot = { fenAfter: startFen, children: [] };
  const errors: CourseTreeError[] = [];
  let branch: Branch = { current: root, parents: [], dead: false, atStart: true, pendingName: null };
  const stack: Branch[] = [];

  for (const token of tokens) {
    if (token.type === 'open') {
      stack.push(branch);
      branch = openVariation(branch);
    } else if (token.type === 'close') {
      const outer = stack.pop();
      if (outer) branch = outer;
      else errors.push(bracketError(token.pgnLine));
    } else if (!branch.dead && token.type === 'comment') {
      applyComment(branch, token.text);
    } else if (!branch.dead && token.type === 'move') {
      playMove(branch, token.san, token.pgnLine, errors);
    }
  }
  return { root, errors };
}

/** A variation replaces the last move: it is played from that move's parent. */
function openVariation(outer: Branch): Branch {
  const parents = outer.parents.slice(0, -1);
  const current = outer.parents.at(-1) ?? outer.current;
  return { current, parents, dead: outer.dead, atStart: true, pendingName: null };
}

function applyComment(branch: Branch, raw: string): void {
  const parsed = parseCourseComment(raw);
  if (branch.atStart) {
    branch.pendingName = parsed.text ?? branch.pendingName;
    return;
  }
  const node = branch.current as DraftNode;
  node.arrows.push(...parsed.arrows);
  if (parsed.text) node.comment = node.comment ? `${node.comment} ${parsed.text}` : parsed.text;
}

function playMove(branch: Branch, san: string, pgnLine: number, errors: CourseTreeError[]): void {
  const chess = new Chess(branch.current.fenAfter);
  const move = tryMove(chess, san);
  if (!move) {
    errors.push(illegalMoveError(branch.current.fenAfter, san, pgnLine));
    branch.dead = true;
    return;
  }
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  const existing = branch.current.children.find((child) => child.uci === uci);
  const node = existing ?? newNode(move.san, uci, chess.fen());
  if (!existing) branch.current.children.push(node);
  if (branch.atStart && branch.pendingName) node.branchName ??= branch.pendingName;
  branch.parents.push(branch.current);
  branch.current = node;
  branch.atStart = false;
  branch.pendingName = null;
}

function tryMove(chess: Chess, san: string): ReturnType<Chess['move']> | null {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}

function newNode(san: string, uci: string, fenAfter: string): DraftNode {
  return { san, uci, fenAfter, comment: null, arrows: [], branchName: null, children: [] };
}

function illegalMoveError(fen: string, san: string, pgnLine: number): CourseTreeError {
  const [, turn, , , , fullmove] = fen.split(' ');
  const side = turn === 'b' ? 'black' : 'white';
  const moveNumber = Number(fullmove);
  const label = `${moveNumber}${side === 'white' ? '.' : '...'} ${san}`;
  return { message: `Illegal move ${label} (PGN line ${pgnLine})`, pgnLine, san, moveNumber, side };
}

function bracketError(pgnLine: number): CourseTreeError {
  return { message: `Unmatched ")" (PGN line ${pgnLine})`, pgnLine, san: null, moveNumber: null, side: null };
}
