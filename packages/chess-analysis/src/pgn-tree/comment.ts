import { asPgnMark, type PgnMark } from './marks.js';

/** A creator's arrow from a PGN `[%cal]`/`[%csl]` tag. A `[%csl]` square
 * becomes an arrow from the square to itself (drawn as a circle). */
export interface PgnArrow {
  from: string;
  to: string;
  kind: 'idea' | 'threat' | 'best';
}

export interface ParsedPgnComment {
  /** The creator's marks written inside the comment (`@quiz`). */
  marks: PgnMark[];
  /** The words left after every `[%…]` tag is removed; null when none. */
  text: string | null;
  arrows: PgnArrow[];
}

/** `@quiz` as a word of its own; `@GothamChess` and `me@key.com` stay text. */
const MARK_WORD = /(?<![\w@])@(key|quiz|slow|fast|reel)(?![\w])/g;
const COMMAND_TAG = /\[%(\w+)\s*([^\]]*)\]/g;
const ARROW_ENTRY = /^([GRYB])([a-h][1-8])([a-h][1-8])?$/;

export function parsePgnComment(raw: string): ParsedPgnComment {
  const arrows: PgnArrow[] = [];
  const marks = [...raw.matchAll(MARK_WORD)].flatMap((match) => asPgnMark(match[1] ?? '') ?? []);
  for (const match of raw.matchAll(COMMAND_TAG)) {
    const [, command, body = ''] = match;
    if (command === 'cal' || command === 'csl') arrows.push(...parseArrowList(body));
  }
  const text = raw.replace(COMMAND_TAG, ' ').replace(MARK_WORD, ' ').replace(/\s+/g, ' ').trim();
  return { text: text === '' ? null : text, arrows, marks };
}

function parseArrowList(body: string): PgnArrow[] {
  return body.split(',').flatMap((entry) => {
    const match = ARROW_ENTRY.exec(entry.trim());
    if (!match) return [];
    const [, color = 'G', from = '', to] = match;
    return [{ from, to: to ?? from, kind: arrowKind(color) }];
  });
}

/** Lichess colours: green = the good move, red = danger, the rest = ideas. */
function arrowKind(color: string): PgnArrow['kind'] {
  if (color === 'G') return 'best';
  if (color === 'R') return 'threat';
  return 'idea';
}
