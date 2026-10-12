import type { DraftNode, DraftRoot } from './build.js';
import type { MarkRef } from './build-marks.js';

/** One section of the creator's text: movetext, optionally with a title and
 * notes in its head (docs/plan.md, "The creator's text"). */
export interface PgnSection {
  /** A head line ending in `:`. */
  title: string | null;
  /** Head lines starting with `#`, without the `#`. */
  notes: string[];
  /** Marks written alone on a head line (`@fast`): the section's pace. */
  marks: MarkRef[];
  /** The section's text with its head lines blanked, so line numbers hold. */
  movetext: string;
  /** The text line (1-based, in the movetext given) the section starts on. */
  firstLine: number;
}

const SEPARATOR = /^\s*-{3,}\s*$/;

/** Cuts the movetext at lines of three or more dashes. Without one, the whole
 * text is the one section, so a standard PGN reads as before. */
export function splitPgnSections(movetext: string, firstLine = 1): PgnSection[] {
  const sections: PgnSection[] = [];
  let lines: string[] = [];
  let startLine = firstLine;
  const flush = (): void => {
    sections.push(readHead(lines, startLine));
    lines = [];
  };
  movetext.split('\n').forEach((line, index) => {
    if (!SEPARATOR.test(line)) {
      lines.push(line);
      return;
    }
    flush();
    startLine = firstLine + index + 1;
  });
  flush();
  return sections;
}

/** The head is everything before the first move: blank lines, a title line
 * (ends in `:`) and note lines (start with `#`). */
function readHead(lines: string[], firstLine: number): PgnSection {
  let title: string | null = null;
  const notes: string[] = [];
  const marks: MarkRef[] = [];
  const blanked = [...lines];
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('#')) notes.push(line.replace(/^#+\s*/, ''));
    else if (line.split(/\s+/).every((word) => word.startsWith('@'))) marks.push(...line.split(/\s+/).map((word) => ({ name: word.slice(1), line: firstLine + index })));
    else if (line.endsWith(':') && !line.startsWith('{')) {
      if (title === null) title = line.slice(0, -1).trim();
      else notes.push(line.slice(0, -1).trim());
    } else break;
    blanked[index] = '';
  }
  return { title, notes, marks, movetext: blanked.join('\n'), firstLine };
}

/** The node a section starts from: the main line's position before the move
 * the section's first move number names (`8.` White's 8th, `8...` Black's
 * 8th). The main line is the first move from each position. One past its end
 * continues it. Null when the main line does not reach that far, or the
 * number is before the start. */
export function sectionStart(root: DraftRoot, number: { moveNumber: number; black: boolean }): DraftNode | DraftRoot | null {
  const [, turn, , , , fullmove] = root.fenAfter.split(' ');
  const plies = 2 * (number.moveNumber - (Number(fullmove) || 1)) + (number.black ? 1 : 0) - (turn === 'b' ? 1 : 0);
  if (plies < 0) return null;
  let current: DraftNode | DraftRoot = root;
  for (let ply = 0; ply < plies; ply += 1) {
    const next: DraftNode | undefined = current.children[0];
    if (!next) return null;
    current = next;
  }
  return current;
}
