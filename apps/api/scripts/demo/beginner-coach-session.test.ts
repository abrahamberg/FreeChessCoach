import { describe, expect, it } from 'vitest';
import { COACH_TRANSCRIPT, FEATURED_SUBJECT_PLY, toStoredContent } from './beginner-coach-session.js';

describe('featured coaching transcript', () => {
  it('alternates sensibly and ends on the coach', () => {
    expect(COACH_TRANSCRIPT[0]!.role).toBe('assistant');
    expect(COACH_TRANSCRIPT.at(-1)!.role).toBe('assistant');
  });

  it('never shows the student raw engine numbers (AGENTS.md: coach copy is translated)', () => {
    for (const entry of COACH_TRANSCRIPT) {
      expect(entry.text, entry.text).not.toMatch(/[+-]\d+\.\d+|\bcp\b|centipawn|\d+ ?cp|eval(uation)? of/i);
    }
  });

  it('keeps the board on the position being discussed at the end', () => {
    const last = COACH_TRANSCRIPT.filter((entry) => entry.showPosition).at(-1)!;
    expect(last.showPosition).toEqual({ moveNumber: 37, color: 'white' });
    expect(FEATURED_SUBJECT_PLY).toBe(73);
  });

  it('stores show_position as a tool call after the text, and plain text otherwise', () => {
    const withBoard = toStoredContent(COACH_TRANSCRIPT[0]!, 0) as { type: string }[];
    expect(withBoard.map((part) => part.type)).toEqual(['text', 'tool-call']);
    expect(toStoredContent(COACH_TRANSCRIPT[1]!, 1)).toEqual([{ type: 'text', text: COACH_TRANSCRIPT[1]!.text }]);
  });
});
