import { Chess } from 'chess.js';

/** How long a mark stays on the board, in ms, fading in and out. */
export const MARK_MS = 1800;

/** A square the coach names (`from === to`, lit up) or a move the coach
 * names (an arrow), `atMs` after the line's audio starts. */
export interface ClipMark {
  atMs: number;
  from: string;
  to: string;
}

// A move ("Qc1#", "8...Qc1#", "exd5", "O-O") or a bare square ("e1").
const TOKEN = /\b(O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)(?![\w-])[+#]?/g;
const SQUARE = /^[a-h][1-8]$/;

/**
 * docs/courses.md §13.4: the squares and moves a spoken line names, on the
 * board it is said over, each timed at its place in the text. A square
 * lights up; a move gets an arrow only when it is legal on that board, so
 * code never draws a move it would have to guess (one already played, or
 * one from another position). Each square or move once.
 */
export function speechMarks(text: string, fen: string, audioMs: number): ClipMark[] {
  const length = text.length;
  if (!length || audioMs <= 0) return [];
  const seen = new Set<string>();
  const marks: ClipMark[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const token = match[1] ?? '';
    const found = SQUARE.test(token) ? { from: token, to: token } : legalMove(fen, token);
    if (!found || seen.has(`${found.from}${found.to}`)) continue;
    seen.add(`${found.from}${found.to}`);
    marks.push({ atMs: Math.round(((match.index ?? 0) / length) * audioMs), ...found });
  }
  return marks;
}

function legalMove(fen: string, san: string): { from: string; to: string } | null {
  try {
    const move = new Chess(fen).move(san);
    return { from: move.from, to: move.to };
  } catch {
    return null;
  }
}

/** A mark's strength at `ms` after the line's audio starts: 0 when off,
 * fading in over 200 ms and out over the last 400. */
export function markAlpha(mark: ClipMark, ms: number): number {
  const t = ms - mark.atMs;
  if (t < 0 || t >= MARK_MS) return 0;
  return Math.min(1, t / 200, (MARK_MS - t) / 400);
}
