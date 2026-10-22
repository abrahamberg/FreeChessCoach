import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { capitalise } from '@freechesscoach/shared';
import { PIECE_NAMES } from '../piece-names.js';
import { renderBoardFact } from '../board-facts/render.js';
import { renderMoveIdea } from '../move-ideas/index.js';
import { CONFIG } from '../config.js';
import { alternativeText } from '../move-story-text.js';
import type { CourseDossier, CourseLineFacts, CourseNodeFacts } from './dossier.js';
import type { CourseTemptingFacts } from './tempting.js';

const ROUTINE_QUALITIES = new Set(['book', 'best', 'excellent', 'good']);
/** A "better" move only where the course move is an error: the Caro-Kann
 * course read 1…c6 "best instead: c5", a move nobody teaching it would play. */
const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);

/** The dossier as prompt text. Verdict words only: no eval number ever
 * reaches the model, so it can't quote one back. */
export function renderCourseDossier(dossier: CourseDossier): string {
  const lineNames = new Map(dossier.lines.map((line) => [line.lineId, line.name]));
  // Past the limit, routine moves get one line and only the notable ones the
  // full block (§5.4: a long game stays compact).
  const compact = dossier.nodes.length > CONFIG.courses.fullBlockNodeLimit;
  // Each line's last move is where it lands (Marshall's 23…Qg3): never one line.
  const lastOfLine = new Map(dossier.nodes.map((node) => [node.lineId, node.nodeId]));
  const ends = new Set(lastOfLine.values());
  return [
    `Learner side: ${capitalise(dossier.learnerSide)}`,
    '',
    'Lines:',
    ...dossier.lines.flatMap(renderLine),
    '',
    'Moves:',
    ...dossier.nodes.flatMap((node) => renderNode(node, lineNames.get(node.lineId) ?? node.lineId, compact && !isNotable(node) && !ends.has(node.nodeId)))
  ].join('\n');
}

function renderLine(line: CourseLineFacts): string[] {
  const opening = line.openingName ? ` | opening: ${line.openingName}` : '';
  const exit = line.bookExitNodeId ? ` | leaves book at ${line.bookExitNodeId}` : ' | in book throughout';
  const rows = [`${line.lineId} "${line.name}"${opening}${exit}`];
  if (line.note) rows.push(`    creator note: "${line.note}"`);
  if (line.endFeatures.length) rows.push(`    end position: ${line.endFeatures.join('; ')}`);
  return rows;
}

function renderNode(node: CourseNodeFacts, lineName: string, oneLine: boolean): string[] {
  const label = `${node.nodeId} ${moveLabel(node)} (${capitalise(node.side)}, ${lineName})`;
  // No verdict word is said of a "no evaluation" example, the move's quality included.
  const head = node.noEvaluation ? label : `${label} | ${node.quality}`;
  if (oneLine) return [head];
  // A book move's verdict is noise: the Najdorf's read "roughly equal → White
  // is slightly better" and back on every move, the eval on a word's edge.
  const rows = [node.quality === 'book' || node.noEvaluation ? head : `${head} | before: ${node.before} → after: ${node.after}`];
  const detail = (label: string, value: string): void => {
    rows.push(`    ${label}: ${value}`);
  };
  if (node.inBook) detail('book', node.openingName ? `in book (${node.openingName})` : 'in book');
  const siblings = sameFamily(node).slice(0, CONFIG.courses.bookSiblingsShown);
  if (siblings.length) detail('the book also has', siblings.map((each) => `${each.san} (${each.name})`).join('; '));
  const bishop = movedBishop(node.san);
  if (bishop) detail('piece', `the ${bishop}`);
  const best = ERROR_QUALITIES.has(node.quality) ? node.bestInstead : null;
  if (best) detail('best instead', `${best.san}; after ${best.line.join(' ')}, ${best.balance}`);
  if (best?.board.length) detail(`why ${best.san} is better`, best.board.map(renderBoardFact).join(' | '));
  if (node.board.length) detail('board', node.board.map(renderBoardFact).join(' | '));
  if (node.ideas.length) detail('ideas', node.ideas.map(renderMoveIdea).join(' | '));
  // Game Review's own notes (loose pieces, misses, the trade, the principle): what the reader sees.
  if (node.notes.length) detail('notes', node.notes.join(' | '));
  if (node.opens.length) detail('opens', node.opens.map((each) => `the ${spokenPiece(each.piece, each.square)} on ${each.square}, from ${each.before} squares to ${each.after}`).join('; '));
  if (node.tactics.length) detail('tactics', node.tactics.join(' '));
  if (node.alternatives.length) detail('alternatives', node.alternatives.map(alternativeText).join('; '));
  for (const tempting of node.tempting) detail(`tempting ${tempting.kind}`, temptingText(node, tempting));
  if (node.creatorComment) detail('creator comment', `"${node.creatorComment}"`);
  if (node.creatorGlyph) detail('creator glyph', node.creatorGlyph);
  const flags = [node.quizEligible && 'quiz-eligible', node.critical && 'critical', node.creatorComment && 'creator-comment', ...node.creatorMarks.map((mark) => `creator-${mark}`)].filter(Boolean);
  if (flags.length) detail('flags', flags.join(', '));
  return rows;
}

/** Each side named, so the model never guesses whose move a fact is: the
 * strong model's Englund run read the answer's "captures the queen" as the
 * tempting move's. */
function temptingText(node: CourseNodeFacts, tempting: CourseTemptingFacts): string {
  const mover = capitalise(node.side);
  const other = node.side === 'white' ? 'Black' : 'White';
  const [answer, ...rest] = tempting.refutation;
  const does = tempting.does.length ? ` ${mover}'s ${tempting.san} ${tempting.does.map(renderBoardFact).join(' | ')}.` : '';
  const after = answer ? ` ${other} answers ${answer}${tempting.after.length ? `: ${tempting.after.map(renderBoardFact).join(' | ')}` : ''}.` : '';
  const line = rest.length ? ` Then ${rest.join(' ')}.` : '';
  // A puzzle move that still works is no "?": it is not the answer, and why.
  const verdict = tempting.notTheAnswer ? ` Works, but not the answer: ${tempting.notTheAnswer}.` : '';
  const standing = tempting.verdict ? ` (${tempting.verdict})` : '';
  return `${tempting.san}${tempting.notTheAnswer ? '' : '?'}${does}${after}${line} Over the line ${tempting.captures}; at the end ${tempting.balance}${standing}.${verdict}`;
}

/** The book's other moves that stay in this move's opening (the Petrov's
 * 3…d6 beside the Stafford's 3…Nc6): 1.e4's nineteen other first moves say
 * nothing about a line. */
function sameFamily(node: CourseNodeFacts): CourseNodeFacts['bookSiblings'] {
  const family = (name: string): string => name.split(':')[0] ?? name;
  return node.openingName ? node.bookSiblings.filter((each) => family(each.name) === family(node.openingName ?? '')) : [];
}

const BOARD = new Chess();

/** A piece as a coach names it aloud: "dark-squared bishop", "knight". Only
 * a bishop needs its square to be told from the other one. */
export function spokenPiece(piece: PieceSymbol, square: string): string {
  return piece === 'b' ? `${BOARD.squareColor(square as Square) ?? 'light'}-squared bishop` : PIECE_NAMES[piece];
}

/** The bishop a move moves, named by where it lands; null for any other piece. */
function movedBishop(san: string): string | null {
  const to = /^B.*?([a-h][1-8])[+#]?$/.exec(san)?.[1];
  return to ? spokenPiece('b', to) : null;
}

function isNotable(node: CourseNodeFacts): boolean {
  return node.critical || node.quizEligible || node.creatorComment !== null || node.creatorGlyph !== null || node.creatorMarks.some((mark) => mark !== 'fast') || node.tactics.length > 0 || !ROUTINE_QUALITIES.has(node.quality);
}

function moveLabel(node: CourseNodeFacts): string {
  return `${node.moveNumber}${node.side === 'white' ? '.' : '…'}${node.san}`;
}
