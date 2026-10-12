import { PGN_GLYPHS, type CourseGlyph } from '@freechesscoach/shared';

/** Movetext tokens of one PGN game, with the PGN text line each starts on so
 * the tree builder can point a creator at an illegal move. */
export type PgnToken =
  | { type: 'move'; san: string; glyph: PgnGlyph | null; numbered: PgnMoveNumber | null; pgnLine: number }
  | { type: 'comment'; text: string; pgnLine: number }
  | { type: 'mark'; name: string; pgnLine: number }
  | { type: 'open'; pgnLine: number }
  | { type: 'close'; pgnLine: number };

export type PgnGlyph = CourseGlyph;

/** The number written before a move: `12.` is White's, `12...` Black's. */
export interface PgnMoveNumber {
  moveNumber: number;
  black: boolean;
}

/** `$1`–`$6` are the glyphs; every other NAG is ignored. */
const NAG_GLYPHS: Record<string, PgnGlyph> = { $1: '!', $2: '?', $3: '!!', $4: '??', $5: '!?', $6: '?!' };
const NUMBERED_WORD = /^(\d+)(\.+|…)(.*)$/;
const IGNORED = /^(\d+|\.+|…|1-0|0-1|1\/2-1\/2|\*)$/;

/** Written in White's place when a section starts with Black's move. */
const WHITE_PLACEHOLDERS = new Set(['-', '--', '..', '...', '…']);

type MoveToken = Extract<PgnToken, { type: 'move' }>;

interface Scan {
  tokens: PgnToken[];
  /** The number just read, for the move that follows it. */
  pending: PgnMoveNumber | null;
  /** The move a glyph written after it belongs to. */
  lastMove: MoveToken | null;
}

/** Splits the movetext (headers removed) into moves, comments and variation
 * brackets. `;` and `#` start a comment to the end of the line, like `{}`
 * (`#` only at the start of a word: `Qh4#` stays a mate). */
export function tokenizePgnMovetext(movetext: string, firstLine: number): PgnToken[] {
  const scan: Scan = { tokens: [], pending: null, lastMove: null };
  let line = firstLine;
  let index = 0;
  while (index < movetext.length) {
    const character = movetext[index] ?? '';
    if (character === '\n') line += 1;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    const startLine = line;
    if (character === '{' || character === ';' || character === '#') {
      const end = movetext.indexOf(character === '{' ? '}' : '\n', index + 1);
      const stop = end === -1 ? movetext.length : end;
      const text = movetext.slice(index + 1, stop);
      line += countNewlines(text);
      scan.tokens.push({ type: 'comment', text, pgnLine: startLine });
      index = character === '{' ? stop + 1 : stop;
      continue;
    }
    if (character === '(' || character === ')') {
      scan.tokens.push({ type: character === '(' ? 'open' : 'close', pgnLine: startLine });
      scan.pending = null;
      scan.lastMove = null;
      index += 1;
      continue;
    }
    const word = /^[^\s{}();]+/.exec(movetext.slice(index))?.[0] ?? character;
    index += word.length;
    pushWord(scan, word, startLine);
  }
  return scan.tokens;
}

/** `12.e4` and `12...Nf6` glue the number to the move; split them off. */
function pushWord(scan: Scan, word: string, pgnLine: number): void {
  const numbered = NUMBERED_WORD.exec(word);
  if (numbered) scan.pending = { moveNumber: Number(numbered[1]), black: numbered[2] === '…' || (numbered[2]?.length ?? 0) >= 3 };
  const rest = numbered ? (numbered[3] ?? '') : word;
  if (scan.pending && !scan.pending.black && WHITE_PLACEHOLDERS.has(rest) && !scan.tokens.some((token) => token.type === 'move')) {
    // `8. - Qf6` is `8... Qf6`: the dash stands for White's move on the main line, and only before the first move.
    scan.pending = { ...scan.pending, black: true };
    return;
  }
  if (rest === '' || IGNORED.test(rest)) return;
  if (rest.startsWith('@')) {
    scan.tokens.push({ type: 'mark', name: rest.slice(1), pgnLine });
    return;
  }
  if (rest.startsWith('$')) {
    setGlyph(scan, NAG_GLYPHS[rest] ?? null);
    return;
  }
  const suffix = /[!?]+$/.exec(rest)?.[0] ?? '';
  const san = rest.slice(0, rest.length - suffix.length);
  if (san === '') {
    setGlyph(scan, asGlyph(suffix));
    return;
  }
  const move: MoveToken = { type: 'move', san, glyph: asGlyph(suffix), numbered: scan.pending, pgnLine };
  scan.tokens.push(move);
  scan.pending = null;
  scan.lastMove = move;
}

function asGlyph(text: string): PgnGlyph | null {
  return PGN_GLYPHS.find((glyph) => glyph === text) ?? null;
}

/** A later glyph on a move replaces the first; one that is not a glyph is dropped. */
function setGlyph(scan: Scan, glyph: PgnGlyph | null): void {
  if (scan.lastMove && glyph) scan.lastMove.glyph = glyph;
}

function countNewlines(text: string): number {
  return text.split('\n').length - 1;
}
