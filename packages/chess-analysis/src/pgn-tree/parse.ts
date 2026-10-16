import { Chess, DEFAULT_POSITION } from 'chess.js';
import { isLegalFen } from '../is-legal-fen.js';
import { MAX_COURSE_STARTS } from '@freechesscoach/shared';
import { splitPgnGames } from '../pgn.js';
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
  /** On a root node of a tree read with `allGames`: the position its game
   * starts from. Absent otherwise. */
  startFen?: string;
}

export interface PgnTreeOptions {
  /** Read every game of the PGN, each a start position of its own, instead
   * of the first game only. Ids continue from one game to the next. */
  allGames?: boolean;
}

export interface PgnTree {
  startFen: string;
  nodes: PgnTreeNode[];
  errors: PgnTreeError[];
}

const HEADER_LINE = /^\s*\[(\w+)\s+"([^"]*)"\]\s*$/;

/**
 * Parses the first game of a PGN, variations included, into a move tree
 * (every game with `allGames`: a lesson's examples, each from its own
 * `[FEN]`). `parsePgnTree` reads the main line only. Ids depend only on the
 * PGN text, so parsing the same PGN twice gives the same ids.
 */
export function parsePgnTree(pgn: string, options: PgnTreeOptions = {}): PgnTree {
  const errors: PgnTreeError[] = [];
  const games = splitPgnGames(pgn);
  const texts = options.allGames ? games : games.slice(0, 1);
  if (texts.length > MAX_COURSE_STARTS) errors.push(sectionError(`A course takes at most ${MAX_COURSE_STARTS} games, each with its own [FEN]; this PGN has ${texts.length}`, 1, null));
  const roots = texts.map((text) => readGame(text, errors));
  errors.push(...extraReelErrors(roots.map((game) => game.root)));
  const nodes: PgnTreeNode[] = [];
  for (const { root, startFen } of roots) flattenTree(root, nodes, options.allGames ? startFen : undefined);
  return { startFen: roots[0]?.startFen ?? DEFAULT_POSITION, nodes, errors };
}

function readGame(text: string, errors: PgnTreeError[]): { root: DraftRoot; startFen: string } {
  const { fenHeader, fenLine, movetext } = splitHeaders(text);
  const startFen = resolveStartFen(fenHeader, fenLine, errors);
  const root = newDraftRoot(startFen);
  splitPgnSections(movetext).forEach((section, index) => playSection(root, section, index === 0, errors));
  return { root, startFen };
}

/** M5: `@reel` marks one move of the course. */
function extraReelErrors(roots: DraftRoot[]): PgnTreeError[] {
  const lines: number[] = [];
  const walk = (node: DraftNode): void => {
    if (node.reelLine !== null) lines.push(node.reelLine);
    node.children.forEach(walk);
  };
  for (const root of roots) root.children.forEach(walk);
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

function sectionError(message: string, pgnLine: number, san: string | null): PgnTreeError {
  return { message, pgnLine, san, moveNumber: null, side: null };
}

/** Header lines are blanked, not removed, so PGN line numbers stay right. */
function splitHeaders(text: string): { fenHeader: string | null; fenLine: number; movetext: string } {
  let fenHeader: string | null = null;
  let fenLine = 1;
  const lines = text.split('\n').map((line, index) => {
    const match = HEADER_LINE.exec(line);
    if (!match) return line;
    if (match[1] === 'FEN') {
      fenHeader = match[2] ?? null;
      fenLine = index + 1;
    }
    return '';
  });
  return { fenHeader, fenLine, movetext: lines.join('\n') };
}

function resolveStartFen(fenHeader: string | null, fenLine: number, errors: PgnTreeError[]): string {
  if (!fenHeader) return DEFAULT_POSITION;
  if (!isLegalFen(fenHeader)) {
    errors.push({ message: `Invalid [FEN] header: ${fenHeader}`, pgnLine: fenLine, san: null, moveNumber: null, side: null });
    return DEFAULT_POSITION;
  }
  return new Chess(fenHeader).fen();
}

/** Appends the tree's nodes to `nodes`, numbered after the ones already there. */
function flattenTree(root: DraftRoot, nodes: PgnTreeNode[], startFen: string | undefined): void {
  const walk = (node: DraftNode, parentId: string | null): void => {
    const id = `n${nodes.length + 1}`;
    const { san, uci, fenAfter, comment, arrows, branchName, branchNote, glyph } = node;
    const marks = effectiveMarks(node);
    nodes.push({ id, parentId, san, uci, fenAfter, comment, arrows, branchName, branchNote, glyph, marks, ...(startFen !== undefined && parentId === null ? { startFen } : {}) });
    for (const child of node.children) walk(child, id);
  };
  for (const child of root.children) walk(child, null);
}
