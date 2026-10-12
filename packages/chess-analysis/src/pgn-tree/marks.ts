import { PGN_MARKS, type CourseMark } from '@freechesscoach/shared';
import type { PgnGlyph } from './tokens.js';

/** The creator's marks on a move (the list is `PGN_MARKS` in shared). */
export type PgnMark = CourseMark;

export function asPgnMark(name: string): PgnMark | null {
  return PGN_MARKS.find((mark) => mark === name) ?? null;
}

export function isPacingMark(mark: PgnMark): boolean {
  return mark === 'fast' || mark === 'slow';
}

/** Marks in `PGN_MARKS` order, so the tree does not depend on how they were written. */
export function sortedMarks(marks: Iterable<PgnMark>): PgnMark[] {
  const present = new Set(marks);
  return PGN_MARKS.filter((mark) => present.has(mark));
}

export function unknownMarkMessage(name: string): string {
  return `Unknown mark @${name}: the marks are ${PGN_MARKS.map((mark) => `@${mark}`).join(', ')}`;
}

/** M5: why `adding` cannot go on a move that has `existing` and `glyph`, or
 * null. A fast move says nothing, so it cannot also be the point (`@key`,
 * `@quiz`, `!`, `!!`) or be slow. */
export function markConflict(existing: readonly PgnMark[], glyph: PgnGlyph | null, adding: PgnMark): string | null {
  const emphatic = glyph === '!' || glyph === '!!';
  if (adding === 'fast') {
    const clash = existing.find((mark) => mark === 'key' || mark === 'quiz' || mark === 'slow') ?? (emphatic ? `${glyph}` : null);
    return clash ? `@fast cannot go with ${clash === glyph ? clash : `@${clash}`} on one move` : null;
  }
  if (existing.includes('fast') && (adding === 'key' || adding === 'quiz' || adding === 'slow')) return `@${adding} cannot go with @fast on one move`;
  return null;
}
