import { Chess, DEFAULT_POSITION } from 'chess.js';
import { isLegalFen } from '../is-legal-fen.js';
import { extractFirstGame } from '../pgn.js';
import { newDraftRoot, playTokens, type DraftNode, type DraftRoot, type PgnTreeError } from './build.js';
import { effectiveMarks } from './build-marks.js';
import type { PgnArrow } from './comment.js';
import type { PgnMark } from './marks.js';
import { splitPgnSections, sectionStart, type PgnSection } from './sections.js';
import { tokenizePgnMovetext, type PgnGlyph, type PgnToken } from './tokens.js';

export type { PgnArrow } from './comment.js';
export type { PgnTreeError } from './build.js';
export type { PgnGlyph } from './tokens.js';
export type { PgnMark } from './marks.js';

export interface PgnTreeNode {
  /** `n1`, `n2` … in pre-order, main continuation first. */
  id: string;
  parentId: string | null;
  san: string;
  uci: string;
  fenAfter: string;
  comment: string | null;
  arrows: PgnArrow[];
  /** A name for the line that continues from this node, from a comment
   * placed before the first move of a variation (or of the game). */
  branchName: string | null;
  /** The note a section's head gave that line. */
  branchNote: string | null;
  glyph: PgnGlyph | null;
  /** The creator's marks, in `PGN_MARKS` order, with the pace of the section or variation. */
  marks: PgnMark[];
}

export interface PgnTree {
  startFen: string;
  nodes: PgnTreeNode[];
  errors: PgnTreeError[];
}

const HEADER_LINE = /^\s*\[(\w+)\s+"([^"]*)"\]\s*$/;

/**
 * Parses the first game of a PGN, variations included, into a move tree.
 * `parsePgn` reads the main line only. Ids depend only on the PGN text, so
 * parsing the same PGN twice gives the same ids.
 */
export function parsePgnTree(pgn: string): PgnTree {
  const { fenHeader, movetext } = splitHeaders(extractFirstGame(pgn));
  const errors: PgnTreeError[] = [];
  const startFen = resolveStartFen(fenHeader, errors);
  const root = newDraftRoot(startFen);
  splitPgnSections(movetext).forEach((section, index) => playSection(root, section, index === 0, errors));
  errors.push(...extraReelErrors(root));
  return { startFen, nodes: flattenTree(root), errors };
}

/** M5: `@reel` marks one move of the course. */
function extraReelErrors(root: DraftRoot): PgnTreeError[] {
  const lines: number[] = [];
  const walk = (node: DraftNode): void => {
    if (node.reelLine !== null) lines.push(node.reelLine);
    node.children.forEach(walk);
  };
  root.children.forEach(walk);
  return lines.slice(1).map((line) => ({ message: `@reel can mark only one move (PGN line ${line})`, pgnLine: line, san: null, moveNumber: null, side: null }));
}

/** The first section starts at the game's start; a later one at the main
 * line's position before the move number its first move carries. */
function playSection(root: DraftRoot, section: PgnSection, isFirst: boolean, errors: PgnTreeError[]): void {
  const tokens = tokenizePgnMovetext(section.movetext, section.firstLine);
  const first = tokens.find((token): token is Extract<PgnToken, { type: 'move' }> => token.type === 'move');
  if (!first) return;
  if (isFirst) {
    playTokens(root, tokens, errors, section);
    return;
  }
  const label = section.title ? `Section "${section.title}"` : `The section at line ${section.firstLine}`;
  if (!first.numbered) {
    errors.push(sectionError(`${label} must start with a move number, like 8. Bd5 or 8... Qf6 (PGN line ${first.pgnLine})`, first.pgnLine, first.san));
    return;
  }
  const start = sectionStart(root, first.numbered);
  if (!start) {
    const { moveNumber, black } = first.numbered;
    errors.push(sectionError(`${label} starts at ${moveNumber}${black ? '...' : '.'}, which the main line does not reach (PGN line ${first.pgnLine})`, first.pgnLine, first.san));
    return;
  }
  playTokens(start, tokens, errors, section);
}

function sectionError(message: string, pgnLine: number, san: string): PgnTreeError {
  return { message, pgnLine, san, moveNumber: null, side: null };
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

function resolveStartFen(fenHeader: string | null, errors: PgnTreeError[]): string {
  if (!fenHeader) return DEFAULT_POSITION;
  if (!isLegalFen(fenHeader)) {
    errors.push({ message: `Invalid [FEN] header: ${fenHeader}`, pgnLine: 1, san: null, moveNumber: null, side: null });
    return DEFAULT_POSITION;
  }
  return new Chess(fenHeader).fen();
}

function flattenTree(root: DraftRoot): PgnTreeNode[] {
  const nodes: PgnTreeNode[] = [];
  const walk = (node: DraftNode, parentId: string | null): void => {
    const id = `n${nodes.length + 1}`;
    const { san, uci, fenAfter, comment, arrows, branchName, branchNote, glyph } = node;
    const marks = effectiveMarks(node);
    nodes.push({ id, parentId, san, uci, fenAfter, comment, arrows, branchName, branchNote, glyph, marks });
    for (const child of node.children) walk(child, id);
  };
  for (const child of root.children) walk(child, null);
  return nodes;
}
