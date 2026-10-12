import { Chess } from 'chess.js';
import { parsePgnComment, type PgnArrow } from './comment.js';
import { markNode, scopeMark, type MarkRef } from './build-marks.js';
import type { PgnMark } from './marks.js';
import type { PgnGlyph, PgnToken } from './tokens.js';

/** A tree node before ids and lines are assigned; children[0] is the main
 * continuation (the first move the PGN gave from that position). */
export interface DraftNode {
  san: string;
  uci: string;
  fenAfter: string;
  comment: string | null;
  arrows: PgnArrow[];
  /** A name for the line that continues from this node, from a comment
   * placed before the first move of a variation (or of the game). */
  branchName: string | null;
  /** The note a section's head gave the line that continues from this node. */
  branchNote: string | null;
  /** The creator's `!`, `??` … on the move. */
  glyph: PgnGlyph | null;
  /** The marks written on this move. */
  marks: PgnMark[];
  /** `@fast` or `@slow` from the section or variation the move was added in. */
  scopePace: PgnMark | null;
  /** The text line of its `@reel`, for the error when a second move has one. */
  reelLine: number | null;
  children: DraftNode[];
}

export interface DraftRoot {
  fenAfter: string;
  children: DraftNode[];
}

export interface PgnTreeError {
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
  /** `@fast` or `@slow` for the moves this branch adds, nested variations too. */
  pace: PgnMark | null;
  /** The section's title and notes, until its first new move takes them. */
  head: SectionHead | null;
}

/** What a section's head says (docs/plan.md S2, S5). */
export interface SectionHead {
  title: string | null;
  notes: string[];
  /** Marks written alone on a head line: they set the section's pace. */
  marks: MarkRef[];
}

export function newDraftRoot(startFen: string): DraftRoot {
  return { fenAfter: startFen, children: [] };
}

/** Plays the tokens from `start` (the root, or a node of the tree built so
 * far), adding to the move tree. A move that already exists from a position
 * is the same node. An illegal move is reported and the rest of its branch
 * is skipped. */
export function playTokens(start: DraftNode | DraftRoot, tokens: PgnToken[], errors: PgnTreeError[], head: SectionHead = { title: null, notes: [], marks: [] }): void {
  let branch: Branch = { current: start, parents: [], dead: false, atStart: true, pendingName: null, pace: null, head };
  for (const mark of head.marks) branch.pace = scopeMark(branch.pace, mark, errors);
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
      applyComment(branch, token, errors);
    } else if (!branch.dead && token.type === 'mark') {
      applyMark(branch, { name: token.name, line: token.pgnLine }, errors);
    } else if (!branch.dead && token.type === 'move') {
      playMove(branch, token, errors);
    }
  }
}

/** A variation replaces the last move: it is played from that move's parent. */
function openVariation(outer: Branch): Branch {
  const parents = outer.parents.slice(0, -1);
  const current = outer.parents.at(-1) ?? outer.current;
  return { current, parents, dead: outer.dead, atStart: true, pendingName: null, pace: outer.pace, head: null };
}

/** Before a branch's first move a mark is the branch's pace; after it, the move's. */
function applyMark(branch: Branch, mark: MarkRef, errors: PgnTreeError[]): void {
  if (branch.atStart) branch.pace = scopeMark(branch.pace, mark, errors);
  else markNode(branch.current as DraftNode, mark, errors);
}

function applyComment(branch: Branch, token: Extract<PgnToken, { type: 'comment' }>, errors: PgnTreeError[]): void {
  const parsed = parsePgnComment(token.text);
  for (const name of parsed.marks) applyMark(branch, { name, line: token.pgnLine }, errors);
  if (branch.atStart) {
    branch.pendingName = parsed.text ?? branch.pendingName;
    return;
  }
  const node = branch.current as DraftNode;
  node.arrows.push(...parsed.arrows);
  if (parsed.text) node.comment = node.comment ? `${node.comment} ${parsed.text}` : parsed.text;
}

function playMove(branch: Branch, token: Extract<PgnToken, { type: 'move' }>, errors: PgnTreeError[]): void {
  const { san, pgnLine } = token;
  const chess = new Chess(branch.current.fenAfter);
  const move = tryMove(chess, san);
  if (!move) {
    errors.push(illegalMoveError(branch.current.fenAfter, san, pgnLine));
    branch.dead = true;
    return;
  }
  const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
  const existing = branch.current.children.find((child) => child.uci === uci);
  const node = existing ?? newNode(move.san, uci, chess.fen(), branch.pace);
  if (!existing) {
    if (branch.head) applyHead(branch.current, node, branch.head);
    branch.head = null;
    branch.current.children.push(node);
  }
  if (branch.atStart && branch.pendingName) node.branchName ??= branch.pendingName;
  if (token.glyph) node.glyph = token.glyph;
  branch.parents.push(branch.current);
  branch.current = node;
  branch.atStart = false;
  branch.pendingName = null;
}

/** The head belongs to the section's first new move (S5): it names and
 * describes a new line (a branch, or the game's first move), and otherwise
 * is the creator's comment on the move. */
function applyHead(parent: DraftNode | DraftRoot, node: DraftNode, head: SectionHead): void {
  const isRoot = !('san' in parent);
  const startsLine = parent.children.length > 0 || isRoot;
  if (startsLine) {
    if (head.title) node.branchName = head.title;
    if (head.notes.length) node.branchNote = head.notes.join(' ');
    return;
  }
  const text = [head.title, ...head.notes].filter(Boolean).join(' — ');
  if (text) node.comment = text;
}

function tryMove(chess: Chess, san: string): ReturnType<Chess['move']> | null {
  try {
    return chess.move(san);
  } catch {
    return null;
  }
}

function newNode(san: string, uci: string, fenAfter: string, scopePace: PgnMark | null): DraftNode {
  return { san, uci, fenAfter, comment: null, arrows: [], branchName: null, glyph: null, branchNote: null, marks: [], scopePace, reelLine: null, children: [] };
}

function illegalMoveError(fen: string, san: string, pgnLine: number): PgnTreeError {
  const [, turn, , , , fullmove] = fen.split(' ');
  const side = turn === 'b' ? 'black' : 'white';
  const moveNumber = Number(fullmove);
  const label = `${moveNumber}${side === 'white' ? '.' : '...'} ${san}`;
  const message = san === '-' || san === '--' ? `Unexpected "${san}" (PGN line ${pgnLine}): it stands for White's move only at the start of a section, as in 8. - Qf6` : `Illegal move ${label} (PGN line ${pgnLine})`;
  return { message, pgnLine, san, moveNumber, side };
}

function bracketError(pgnLine: number): PgnTreeError {
  return { message: `Unmatched ")" (PGN line ${pgnLine})`, pgnLine, san: null, moveNumber: null, side: null };
}
