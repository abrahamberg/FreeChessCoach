export interface ArrowRef {
  from: string;
  to: string;
  /** The move the arrow makes, when a piece can make it ("Qe3+") —
   * chess-analysis's arrowMoveSan, worked out on the board it was drawn on. */
  san?: string;
}

const ARROW_TOKEN_PATTERN = /\[([a-h][1-8])-([a-h][1-8])(?: ([A-Za-z0-9=+#-]+))?\]/g;

/** The inline token a student's drawn-arrow chip serializes to inside a
 * plain-text chat message, e.g. "I think [e2-e4 e4] is a good option" — the
 * squares, then the move when a piece can make it. Older messages carry only
 * the squares ("[e2-e4]"), which still parse. */
export function encodeArrowToken(arrow: ArrowRef): string {
  return arrow.san ? `[${arrow.from}-${arrow.to} ${arrow.san}]` : `[${arrow.from}-${arrow.to}]`;
}

/** What a chip shows: the move when there is one, else the two squares. */
export function arrowLabel(arrow: ArrowRef): string {
  return arrow.san ?? `${arrow.from}→${arrow.to}`;
}

export type ArrowTextSegment = { type: 'text'; value: string } | ({ type: 'arrow' } & ArrowRef);

/** Splits message text on embedded arrow tokens so callers can render each
 * one as an inline badge instead of literal brackets. */
export function splitArrowTokens(text: string): ArrowTextSegment[] {
  const segments: ArrowTextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(ARROW_TOKEN_PATTERN)) {
    const [full, from, to, san] = match;
    const index = match.index;
    if (index > lastIndex) segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    segments.push({ type: 'arrow', from: from ?? '', to: to ?? '', ...(san ? { san } : {}) });
    lastIndex = index + full.length;
  }
  if (lastIndex < text.length) segments.push({ type: 'text', value: text.slice(lastIndex) });

  return segments;
}
