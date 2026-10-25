import type { CourseArrow } from '@freechesscoach/shared';
import { Chess } from 'chess.js';

const SAN = String.raw`(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[!?]{0,2}`;
// "14...Bxg4", "14. ... Bxg4", "16 g3", then more moves, numbered or not, with
// a short aside like "(attacking the queen)" allowed between them.
const DOTS = String.raw`(?:\.\s*)?(?:\.{2,}|…)|\.`;
const MOVE_NUMBER = String.raw`(\d+)(${DOTS})?\s*`;
const ASIDE = String.raw`\([^()\n]{0,60}\)`;
const NUMBERED_LINE = String.raw`${MOVE_NUMBER}${SAN}(?:\s+(?:${ASIDE}\s+)?(?:\d+(?:${DOTS})?\s*)?${SAN})*`;
const SQUARE = /(?<![A-Za-z0-9])[a-h][1-8](?![A-Za-z0-9])/;
const RANK = /\b([Ff]irst|[Ss]econd|[Tt]hird|[Ff]ourth|[Ff]ifth|[Ss]ixth|[Ss]eventh|[Ee]ighth|[1-8](?:st|nd|rd|th)) rank\b/;
const FILE = /\b([a-h])-file\b/;
const MENTION = new RegExp(`(?<![\\w.])${NUMBERED_LINE}|${RANK.source}|${FILE.source}|${SQUARE.source}`, 'g');
// One move of a line: its number (if written), its dots and its SAN; or an aside, skipped.
const LINE_MOVE = new RegExp(String.raw`${ASIDE}|(?:(\d+)(${DOTS})?\s*)?(${SAN})`, 'g');
const RANK_NUMBERS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };

/** A line of moves the note writes out: from `fen`, `sans` in turn. */
export interface NoteLine {
  fen: string;
  sans: string[];
}

/** A stretch of a note: plain text, or something it names with what to draw
 * on the board while the reader points at it or the voice reaches it. */
export interface NoteSegment {
  text: string;
  /** Where it starts in the note. */
  start: number;
  marks?: CourseArrow[];
  /** Two or more moves in a row ("14...Bxg4 15 Qc2 Bf3"): opened on a board to play through. */
  line?: NoteLine;
}

/** A note split at what it names: a numbered move ("2...f6", "3.Nf3") is an
 * arrow, played from the position where that move number comes up in the
 * line, and the moves written after it make it a line; a square ("f6", "the
 * f8-bishop"), a whole rank ("the fifth rank") or a file ("the c-file") is
 * lit. `fensBefore` are the line's positions, the one before each move. */
export function noteSegments(text: string, fensBefore: readonly string[]): NoteSegment[] {
  const segments: NoteSegment[] = [];
  const mention = new RegExp(MENTION);
  let at = 0;
  for (let match = mention.exec(text); match; match = mention.exec(text)) {
    const found = mentionOf(match, fensBefore);
    if (!found) continue;
    // A line ends at its last legal move; what follows is read again.
    mention.lastIndex = match.index + found.length;
    if (match.index > at) segments.push({ text: text.slice(at, match.index), start: at });
    segments.push({ text: match[0].slice(0, found.length), start: match.index, marks: found.marks, ...(found.line && { line: found.line }) });
    at = match.index + found.length;
  }
  if (at < text.length) segments.push({ text: text.slice(at), start: at });
  return segments;
}

interface Mention {
  marks: CourseArrow[];
  /** How much of the match it covers. */
  length: number;
  line?: NoteLine;
}

const lit = (square: string): CourseArrow => ({ from: square, to: square, kind: 'idea' });

function mentionOf(match: RegExpExecArray, fensBefore: readonly string[]): Mention | null {
  if (match[1]) return lineMention(match[0], fensBefore);
  return { marks: areaMarks(match), length: match[0].length };
}

function areaMarks(match: RegExpExecArray): CourseArrow[] {
  if (match[3]) {
    const word = match[3].toLowerCase();
    const rank = RANK_NUMBERS[word] ?? Number.parseInt(word, 10);
    return 'abcdefgh'.split('').map((file) => lit(`${file}${rank}`));
  }
  if (match[4]) return [1, 2, 3, 4, 5, 6, 7, 8].map((rank) => lit(`${match[4]}${rank}`));
  return [lit(match[0])];
}

const isBlackDots = (dots: string | undefined): boolean => Boolean(dots && (dots.includes('..') || dots.includes('…')));

/** The moves of a numbered line, played from where its first number comes
 * up, as far as they stay legal and their numbers follow on. */
function lineMention(text: string, fensBefore: readonly string[]): Mention | null {
  const moves = [...text.matchAll(LINE_MOVE)].filter((move) => move[3]);
  const first = moves[0];
  if (!first) return null;
  const black = isBlackDots(first[2]);
  const fen = fensBefore.find((each) => {
    const [, side, , , , full] = each.split(' ');
    return Number(full) === Number(first[1]) && side === (black ? 'b' : 'w');
  });
  if (!fen) return null;
  const chess = new Chess(fen);
  const sans: string[] = [];
  const marks: CourseArrow[] = [];
  let length = 0;
  for (const move of moves) {
    if (move[1] && !numberFits(chess, Number(move[1]), isBlackDots(move[2]))) break;
    try {
      const played = chess.move((move[3] ?? '').replace(/[!?]+$/, ''));
      if (sans.length === 0) marks.push({ from: played.from, to: played.to, kind: 'idea' });
      sans.push(played.san);
    } catch {
      // Not a legal move there: the line (or the number) was something else.
      break;
    }
    length = (move.index ?? 0) + move[0].length;
  }
  if (sans.length === 0) return null;
  return { marks, length, ...(sans.length > 1 && { line: { fen, sans } }) };
}

/** A number written inside a line names the move that comes next ("15 Qc2", "15...Bf3"). */
function numberFits(chess: Chess, number: number, black: boolean): boolean {
  const [, side, , , , full] = chess.fen().split(' ');
  if (Number(full) !== number) return false;
  // "15 Bf3" for Black's move is loose but common; a "15..." on White's move is not.
  return side === 'b' || !black;
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
