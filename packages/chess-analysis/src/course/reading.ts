import type { CourseSection } from '@freechesscoach/shared';

/** A page of a reading course is about this many characters: a few
 * paragraphs, then the next page. */
const PAGE_CHARS = 700;

/**
 * docs/courses.md §3, `reading`: the text a creator pastes becomes the
 * course's pages, with no AI. A blank line ends a paragraph; a ```fen block
 * puts that position on the board from the next paragraph on, and a page
 * with no diagram of its own keeps the board it had. Pages carry a `fen`
 * only where the board changes. Headings and page marks are dropped.
 */
export function parseReadingSections(text: string): { sections: CourseSection[]; errors: string[] } {
  const errors: string[] = [];
  // A page mark in the middle of a sentence does not end the paragraph; a word cut at the line's end ("won-") is whole again.
  text = text.replace(/([^\n])\n\n<!--[^>]*-->\n\n(?!```)/g, (_whole, last: string) => (/[.!?:"”'’)]/.test(last) ? `${last}\n\n` : last === '-' ? '' : `${last} `));
  const pages: { text: string; fen?: string }[] = [];
  let pending: string | undefined;
  let open: { text: string; fen?: string } | null = null;
  const close = (): void => {
    if (open) pages.push(open);
    open = null;
  };
  const addParagraph = (paragraph: string): void => {
    if (!open) open = { text: paragraph, ...(pending ? { fen: pending } : {}) };
    else if (pending) {
      close();
      open = { text: paragraph, fen: pending };
    } else open.text += `\n\n${paragraph}`;
    pending = undefined;
    if (open.text.length >= PAGE_CHARS) close();
  };
  const lines = text.split('\n');
  let paragraph: string[] = [];
  const flush = (): void => {
    const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    paragraph = [];
    if (joined) addParagraph(joined);
  };
  for (let index = 0; index < lines.length; index++) {
    const line = (lines[index] ?? '').trim();
    if (line.startsWith('```fen')) {
      flush();
      const fen = (lines[index + 1] ?? '').trim();
      index += 2;
      if (isFen(fen)) pending = fen;
      else errors.push(`Line ${index}: "${fen}" is not a position`);
    } else if (line.startsWith('<!--') || line.startsWith('#')) flush();
    else if (!line) flush();
    else paragraph.push(line);
  }
  flush();
  close();
  return { sections: pages.map((page, index) => ({ id: `s${index + 1}`, text: page.text, ...(page.fen ? { fen: page.fen } : {}) })), errors };
}

/** A diagram may show part of a position (a castled king and no enemy king), so only the board is checked: eight ranks of eight squares. */
function isFen(fen: string): boolean {
  const ranks = (fen.split(' ')[0] ?? '').split('/');
  return ranks.length === 8 && ranks.every((rank) => /^[1-8pnbrqkPNBRQK]+$/.test(rank) && [...rank].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : 1), 0) === 8);
}

/** The position a page shows: its own diagram, else the nearest one before it. */
export function sectionFen(sections: readonly CourseSection[], index: number): string | null {
  for (let at = index; at >= 0; at--) {
    const fen = sections[at]?.fen;
    if (fen) return fen;
  }
  return null;
}
