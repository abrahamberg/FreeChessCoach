import { Chess } from 'chess.js';
import type { AuditItem, AuditPosition, Label, LineView } from './types.js';

/** A position and its sentences as a judge reads them: both boards, the
 * engine's lines before and after, and what the code checks found. */
export function renderPosition(position: AuditPosition, items: AuditItem[], labels?: Map<string, Label>): string {
  const reader = position.readerSide === position.mover ? 'the reader played it ("You")' : 'the opponent played it ("They")';
  const rows = [
    `### ${position.moveLabel} — ${position.gameId} ${position.where} (${position.band}, ${position.split})${position.url ? ` ${position.url}` : ''}`,
    `Mover: ${position.mover}; ${reader}. Quality: ${position.quality ?? '-'}.${position.focus ? ' A Lichess puzzle starts here.' : ''}`,
    '',
    '```',
    ...sideBySide(boardRows(position.fenBefore, `before (${turnName(position.fenBefore)} to move)`), boardRows(position.fenAfter, `after ${position.san}`)),
    `before: ${position.fenBefore}`,
    `after:  ${position.fenAfter}`,
    `engine before: ${linesText(position.linesBefore)}`,
    `engine after:  ${linesText(position.linesAfter)}`,
    '```',
    ''
  ];
  for (const item of items) {
    const failed = item.checks.filter((check) => !check.ok);
    const checks = failed.length ? ` — CODE CHECK FAILED: ${failed.map((check) => `${check.check} (${check.detail})`).join('; ')}` : item.checks.length ? ` — checks passed: ${item.checks.map((check) => check.check).join(', ')}` : '';
    const label = labels?.get(item.key);
    rows.push(`- \`${item.key.slice(0, 10)}\` [${item.surface}] ${item.source}: "${item.text}"${checks}${label ? ` — LABEL ${label.verdict}: ${label.note}` : ''}`);
  }
  return rows.join('\n');
}

function turnName(fen: string): string {
  return fen.split(' ')[1] === 'b' ? 'Black' : 'White';
}

function boardRows(fen: string, title: string): string[] {
  const board = new Chess(fen).board();
  const rows = board.map((row, index) => `${8 - index} ${row.map((cell) => (cell ? (cell.color === 'w' ? cell.type.toUpperCase() : cell.type) : '.')).join(' ')}`);
  return [title, ...rows, '  a b c d e f g h'];
}

function sideBySide(left: string[], right: string[]): string[] {
  return left.map((row, index) => `${row.padEnd(28)}${right[index] ?? ''}`);
}

/** White's view: +1.2 is White a pawn and a bit better; #3 White mates in 3, #-3 Black does. */
export function linesText(lines: LineView[]): string {
  if (!lines.length) return '(none: mate or stalemate on the board)';
  return lines.map((line) => `${line.mate !== null ? `#${line.mate}` : `${(line.cp ?? 0) >= 0 ? '+' : ''}${((line.cp ?? 0) / 100).toFixed(2)}`} ${line.pv.join(' ')}`).join(' | ');
}
