import type { CourseDossier, CourseLineFacts, CourseNodeFacts } from './course-dossier.js';
import type { CourseTemptingFacts } from './course-tempting.js';

/** Past this many nodes, routine moves get one line and only the notable
 * ones get the full block (§5.4: a long game stays compact). */
const FULL_BLOCK_NODE_LIMIT = 40;
const ROUTINE_QUALITIES = new Set(['book', 'best', 'excellent', 'good']);

/** The dossier as prompt text. Verdict words only: no eval number ever
 * reaches the model, so it can't quote one back. */
export function renderCourseDossier(dossier: CourseDossier): string {
  const lineNames = new Map(dossier.lines.map((line) => [line.lineId, line.name]));
  const compact = dossier.nodes.length > FULL_BLOCK_NODE_LIMIT;
  return [
    `Learner side: ${capitalise(dossier.learnerSide)}`,
    '',
    'Lines:',
    ...dossier.lines.flatMap(renderLine),
    '',
    'Moves:',
    ...dossier.nodes.flatMap((node) => renderNode(node, lineNames.get(node.lineId) ?? node.lineId, compact && !isNotable(node)))
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
  const rows = [`${head} | before: ${node.before} → after: ${node.after}`];
  const detail = (label: string, value: string): void => {
    rows.push(`    ${label}: ${value}`);
  };
  if (node.inBook) detail('book', node.openingName ? `in book (${node.openingName})` : 'in book');
  if (node.bestInstead) detail('best instead', `${node.bestInstead.san}; after ${node.bestInstead.line.join(' ')}, ${node.bestInstead.balance}`);
  if (node.bestInstead?.board.length) detail(`why ${node.bestInstead.san} is better`, node.bestInstead.board.join(' | '));
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
  return `${tempting.san}?${does}${after}${line} Over the line ${tempting.captures} (${tempting.verdict}).`;
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
