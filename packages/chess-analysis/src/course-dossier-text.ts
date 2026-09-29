import type { CourseDossier, CourseLineFacts, CourseNodeFacts } from './course-dossier.js';
import type { CourseTemptingFacts } from './course-tempting.js';

/** Past this many nodes, routine moves get one line and only the notable
 * ones get the full block (§5.4: a long game stays compact). */
const FULL_BLOCK_NODE_LIMIT = 40;
const ROUTINE_QUALITIES = new Set(['book', 'best', 'excellent', 'good']);
/** A "better" move only where the course move is an error: the Caro-Kann
 * course read 1…c6 "best instead: c5", a move nobody teaching it would play. */
const ERROR_QUALITIES = new Set(['inaccuracy', 'mistake', 'blunder', 'miss']);

/** The dossier as prompt text. Verdict words only: no eval number ever
 * reaches the model, so it can't quote one back. */
export function renderCourseDossier(dossier: CourseDossier): string {
  const lineNames = new Map(dossier.lines.map((line) => [line.lineId, line.name]));
  const compact = dossier.nodes.length > FULL_BLOCK_NODE_LIMIT;
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
  if (line.endFeatures.length) rows.push(`    end position: ${line.endFeatures.join('; ')}`);
  return rows;
}

function renderNode(node: CourseNodeFacts, lineName: string, oneLine: boolean): string[] {
  const head = `${node.nodeId} ${moveLabel(node)} (${capitalise(node.side)}, ${lineName}) | ${node.quality}`;
  if (oneLine) return [head];
  // A book move's verdict is noise: the Najdorf's read "roughly equal → White
  // is slightly better" and back on every move, the eval on a word's edge.
  const rows = [node.quality === 'book' ? head : `${head} | before: ${node.before} → after: ${node.after}`];
  const detail = (label: string, value: string): void => {
    rows.push(`    ${label}: ${value}`);
  };
  if (node.inBook) detail('book', node.openingName ? `in book (${node.openingName})` : 'in book');
  const best = ERROR_QUALITIES.has(node.quality) ? node.bestInstead : null;
  if (best) detail('best instead', `${best.san}; after ${best.line.join(' ')}, ${best.balance}`);
  if (best?.board.length) detail(`why ${best.san} is better`, best.board.join(' | '));
  if (node.board.length) detail('board', node.board.join(' | '));
  if (node.tactics.length) detail('tactics', node.tactics.join(' '));
  if (node.alternatives.length) detail('alternatives', node.alternatives.map((alt) => `${alt.san}: ${alt.verdict}`).join('; '));
  for (const tempting of node.tempting) detail(`tempting ${tempting.kind}`, temptingText(node, tempting));
  if (node.creatorComment) detail('creator comment', `"${node.creatorComment}"`);
  const flags = [node.quizEligible && 'quiz-eligible', node.critical && 'critical', node.creatorComment && 'creator-comment'].filter(Boolean);
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
  const does = tempting.does.length ? ` ${mover}'s ${tempting.san} ${tempting.does.join(' | ')}.` : '';
  const after = answer ? ` ${other} answers ${answer}${tempting.after.length ? `: ${tempting.after.join(' | ')}` : ''}.` : '';
  const line = rest.length ? ` Then ${rest.join(' ')}.` : '';
  // A puzzle move that still works is no "?": it is not the answer, and why.
  const verdict = tempting.notTheAnswer ? ` Works, but not the answer: ${tempting.notTheAnswer}.` : '';
  return `${tempting.san}${tempting.notTheAnswer ? '' : '?'}${does}${after}${line} Over the line ${tempting.captures}; at the end ${tempting.balance} (${tempting.verdict}).${verdict}`;
}

function isNotable(node: CourseNodeFacts): boolean {
  return node.critical || node.quizEligible || node.creatorComment !== null || node.tactics.length > 0 || !ROUTINE_QUALITIES.has(node.quality);
}

function moveLabel(node: CourseNodeFacts): string {
  return `${node.moveNumber}${node.side === 'white' ? '.' : '…'}${node.san}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
