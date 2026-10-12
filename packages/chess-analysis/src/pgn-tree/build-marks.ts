import type { DraftNode, PgnTreeError } from './build.js';
import { asPgnMark, isPacingMark, markConflict, sortedMarks, unknownMarkMessage, type PgnMark } from './marks.js';

/** A mark as written, with the text line it is on. */
export interface MarkRef {
  name: string;
  line: number;
}

function markError(message: string, line: number): PgnTreeError {
  return { message: `${message} (PGN line ${line})`, pgnLine: line, san: null, moveNumber: null, side: null };
}

/** A mark in a head or before a variation's first move sets the pace of the
 * moves that follow (M3): only `@fast` and `@slow` can. */
export function scopeMark(pace: PgnMark | null, mark: MarkRef, errors: PgnTreeError[]): PgnMark | null {
  const known = asPgnMark(mark.name);
  if (!known) {
    errors.push(markError(unknownMarkMessage(mark.name), mark.line));
    return pace;
  }
  if (!isPacingMark(known)) {
    errors.push(markError(`@${known} marks one move: write it after the move, not before the first move of a section or variation`, mark.line));
    return pace;
  }
  if (pace && pace !== known) {
    errors.push(markError(`@${known} cannot go with @${pace} here`, mark.line));
    return pace;
  }
  return known;
}

/** A mark after a move: it applies to that move. */
export function markNode(node: DraftNode, mark: MarkRef, errors: PgnTreeError[]): void {
  const known = asPgnMark(mark.name);
  if (!known) {
    errors.push(markError(unknownMarkMessage(mark.name), mark.line));
    return;
  }
  const conflict = markConflict(node.marks, node.glyph, known);
  if (conflict) {
    errors.push(markError(`${conflict}: ${node.san}`, mark.line));
    return;
  }
  node.marks = sortedMarks([...node.marks, known]);
  if (known === 'reel') node.reelLine ??= mark.line;
}

/** The move's own marks, else the pace of its section or variation. A scope's
 * `@fast` never lands on a move that is the point (`@key`, `@quiz`, `!`). */
export function effectiveMarks(node: DraftNode): PgnMark[] {
  if (node.marks.some(isPacingMark) || !node.scopePace) return node.marks;
  if (markConflict(node.marks, node.glyph, node.scopePace)) return node.marks;
  return sortedMarks([...node.marks, node.scopePace]);
}
