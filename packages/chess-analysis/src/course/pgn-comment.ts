/** A creator's arrow from a PGN `[%cal]`/`[%csl]` tag. A `[%csl]` square
 * becomes an arrow from the square to itself (drawn as a circle). */
export interface CourseTreeArrow {
  from: string;
  to: string;
  kind: 'idea' | 'threat' | 'best';
}

export interface ParsedCourseComment {
  /** The words left after every `[%…]` tag is removed; null when none. */
  text: string | null;
  arrows: CourseTreeArrow[];
}

const COMMAND_TAG = /\[%(\w+)\s*([^\]]*)\]/g;
const ARROW_ENTRY = /^([GRYB])([a-h][1-8])([a-h][1-8])?$/;

export function parseCourseComment(raw: string): ParsedCourseComment {
  const arrows: CourseTreeArrow[] = [];
  for (const match of raw.matchAll(COMMAND_TAG)) {
    const [, command, body = ''] = match;
    if (command === 'cal' || command === 'csl') arrows.push(...parseArrowList(body));
  }
  const text = raw.replace(COMMAND_TAG, ' ').replace(/\s+/g, ' ').trim();
  return { text: text === '' ? null : text, arrows };
}

function parseArrowList(body: string): CourseTreeArrow[] {
  return body.split(',').flatMap((entry) => {
    const match = ARROW_ENTRY.exec(entry.trim());
    if (!match) return [];
    const [, color = 'G', from = '', to] = match;
    return [{ from, to: to ?? from, kind: arrowKind(color) }];
  });
}

/** Lichess colours: green = the good move, red = danger, the rest = ideas. */
function arrowKind(color: string): CourseTreeArrow['kind'] {
  if (color === 'G') return 'best';
  if (color === 'R') return 'threat';
  return 'idea';
}
