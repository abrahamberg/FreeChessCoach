import type { CourseArrow } from '@freechesscoach/shared';
import { Chess } from 'chess.js';

const NUMBERED_MOVE = /(\d+)(\.{3}|\.)\s*((?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?)/;
const SQUARE = /(?<![A-Za-z0-9])[a-h][1-8](?![A-Za-z0-9])/;
const RANK = /\b([Ff]irst|[Ss]econd|[Tt]hird|[Ff]ourth|[Ff]ifth|[Ss]ixth|[Ss]eventh|[Ee]ighth|[1-8](?:st|nd|rd|th)) rank\b/;
const FILE = /\b([a-h])-file\b/;
const MENTION = new RegExp(`${NUMBERED_MOVE.source}|${RANK.source}|${FILE.source}|${SQUARE.source}`, 'g');
const RANK_NUMBERS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };

/** A stretch of a note: plain text, or something it names with what to draw
 * on the board while the reader points at it or the voice reaches it. */
export interface NoteSegment {
  text: string;
  /** Where it starts in the note. */
  start: number;
  marks?: CourseArrow[];
}

/** A note split at what it names: a numbered move ("2...f6", "3.Nf3") is an
 * arrow, played from the position where that move number comes up in the
 * line; a square ("f6", "the f8-bishop"), a whole rank ("the fifth rank") or
 * a file ("the c-file") is lit. `fensBefore` are the line's positions, the
 * one before each move. */
export function noteSegments(text: string, fensBefore: readonly string[]): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let at = 0;
  for (const match of text.matchAll(MENTION)) {
    const marks = marksOf(match, fensBefore);
    if (marks.length === 0) continue;
    if (match.index > at) segments.push({ text: text.slice(at, match.index), start: at });
    segments.push({ text: match[0], start: match.index, marks });
    at = match.index + match[0].length;
  }
  if (at < text.length) segments.push({ text: text.slice(at), start: at });
  return segments;
}

const lit = (square: string): CourseArrow => ({ from: square, to: square, kind: 'idea' });

function marksOf(match: RegExpMatchArray, fensBefore: readonly string[]): CourseArrow[] {
  if (match[1]) return moveMarks(Number(match[1]), match[2] === '...', match[3] ?? '', fensBefore);
  if (match[4]) {
    const word = match[4].toLowerCase();
    const rank = RANK_NUMBERS[word] ?? Number.parseInt(word, 10);
    return 'abcdefgh'.split('').map((file) => lit(`${file}${rank}`));
  }
  if (match[5]) return [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => lit(`${match[5]}${rank}`));
  return [lit(match[0])];
}

function moveMarks(number: number, black: boolean, san: string, fensBefore: readonly string[]): CourseArrow[] {
  const fen = fensBefore.find((each) => {
    const [, side, , , , full] = each.split(' ');
    return Number(full) === number && side === (black ? 'b' : 'w');
  });
  if (!fen) return [];
  try {
    const move = new Chess(fen).move(san);
    return [{ from: move.from, to: move.to, kind: 'idea' }];
  } catch {
    // Not a legal move there: the number was something else.
    return [];
  }
}

// A sentence ends at . ! ? before a space (not the dot of "2. Nf3"); a paragraph at a line break.
const SENTENCE_END = /(?<!\d\.)(?<=[.!?])\s+|\n+/g;

/** Where each sentence of the note starts and ends. */
export function sentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let start = 0;
  for (const match of [...text.matchAll(SENTENCE_END), { index: text.length, 0: '' }]) {
    if (text.slice(start, match.index).trim()) ranges.push({ start, end: match.index });
    start = match.index + match[0].length;
  }
  return ranges;
}

/** Characters of speech a paragraph pause is worth, for finding the place in a recording. */
const PAUSE_CHARS = 12;

/** What each sentence weighs in a recording: its letters, a paragraph pause a few more. */
function sentenceSizes(text: string): number[] {
  const ranges = sentenceRanges(text);
  return ranges.map((range, index) => range.end - range.start + (index > 0 && /\n/.test(text.slice(ranges[index - 1]!.end, range.start)) ? PAUSE_CHARS : 0));
}

/** The sentence a recording is in, `fraction` (0..1) of the way through it. */
export function readingSentence(text: string, fraction: number): number {
  const sizes = sentenceSizes(text);
  let left = Math.min(Math.max(fraction, 0), 1) * sizes.reduce((total, size) => total + size, 0);
  for (const [index, size] of sizes.entries()) {
    if (left < size) return index;
    left -= size;
  }
  return Math.max(sizes.length - 1, 0);
}

/** How far into the recording (0..1) sentence `index` starts. */
export function sentenceStart(text: string, index: number): number {
  const sizes = sentenceSizes(text);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return total > 0 ? sizes.slice(0, index).reduce((sum, size) => sum + size, 0) / total : 0;
}
