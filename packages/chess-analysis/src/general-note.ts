/** The coach's notes on a student are long-term memory, so they describe a
 * habit, not a moment: "At 10...Bd7 he saw the knight was defended" is true of
 * one move and says nothing about next month. A note that names a move, a
 * move number or a square is refused, with the way to fix it. */

export const MAX_HABIT_NOTE_CHARS = 400;
export const MAX_LESSON_NOTE_CHARS = 600;

export type GeneralNoteCheck = { ok: true } | { ok: false; reason: string };

const MOVE_NUMBER = /\b\d{1,3}\s*(?:\.{1,3}|…)\s*[A-Za-zO0]/;
const MOVE_WORDS = /\b(?:moves?|ply|plies)\s+\d{1,3}\b/i;
const SAN_PIECE_MOVE = /\b[KQRBN][a-h]?[1-8]?x?[a-h][1-8][+#]?(?![\w-])/;
const SAN_PAWN_CAPTURE = /\b[a-h]x[a-h][1-8]\b/;
const SQUARE = /\b[a-h][1-8]\b/;
const CASTLES = /\bO-O(?:-O)?\b/;

const WHAT_TO_DO = 'write it as the habit, in words, without move numbers, moves or squares';

export function checkGeneralNote(text: string, maxChars: number): GeneralNoteCheck {
  const note = text.trim();
  if (note === '') return { ok: false, reason: 'the note is empty' };
  if (note.length > maxChars) return { ok: false, reason: `the note is ${note.length} characters; keep it under ${maxChars}` };
  if (MOVE_NUMBER.test(note) || MOVE_WORDS.test(note)) return { ok: false, reason: `the note names a move number; ${WHAT_TO_DO}` };
  if (SAN_PIECE_MOVE.test(note) || SAN_PAWN_CAPTURE.test(note) || CASTLES.test(note)) return { ok: false, reason: `the note names a move; ${WHAT_TO_DO}` };
  if (SQUARE.test(note)) return { ok: false, reason: `the note names a square; ${WHAT_TO_DO}` };
  return { ok: true };
}
