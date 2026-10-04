import { describe, expect, test } from 'vitest';
import { checkGeneralNote, MAX_HABIT_NOTE_CHARS } from './general-note.js';

const refused = (text: string) => checkGeneralNote(text, MAX_HABIT_NOTE_CHARS).ok === false;

describe('checkGeneralNote', () => {
  test('refuses a note about one move: a move number, a move, a square', () => {
    expect(refused('At 10...Bd7, Daniel identified that the move protected the attacked knight on c6.')).toBe(true);
    expect(refused('He missed 17.a5 again')).toBe(true);
    expect(refused('On move 12 he left the piece loose')).toBe(true);
    expect(refused('He plays Nxd5 without checking recaptures')).toBe(true);
    expect(refused('exf4 was missed')).toBe(true);
    expect(refused('The pawn on e4 was weak')).toBe(true);
    expect(refused('He castled with O-O too late')).toBe(true);
  });

  test('accepts a habit written in words', () => {
    const habit = 'Daniel counts the defenders of an attacked piece when cued, but does not scan for loose pieces before committing to a capture.';
    expect(checkGeneralNote(habit, MAX_HABIT_NOTE_CHARS)).toEqual({ ok: true });
  });

  test('refuses an empty or over-long note, and says why', () => {
    expect(checkGeneralNote('  ', 100)).toMatchObject({ ok: false, reason: expect.stringContaining('empty') });
    expect(checkGeneralNote('a'.repeat(101), 100)).toMatchObject({ ok: false, reason: expect.stringContaining('under 100') });
  });

  test('the refusal tells the coach how to fix the note', () => {
    expect(checkGeneralNote('on move 12 it hung', 100)).toMatchObject({ reason: expect.stringContaining('write it as the habit') });
  });
});
