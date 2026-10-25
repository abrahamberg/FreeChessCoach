import { describe, expect, it } from 'vitest';
import { noteSegments, readingSentence, sentenceRanges, sentenceStart } from './note-marks.js';

const AFTER_E4_E5_NF3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

describe('noteSegments', () => {
  it('splits a note at a numbered move and a named square', () => {
    const segments = noteSegments('2...f6 is bad, my knight belongs on f6, not the f8-bishop.', [AFTER_E4_E5_NF3]);
    expect(segments.map((each) => each.text).join('')).toBe('2...f6 is bad, my knight belongs on f6, not the f8-bishop.');
    expect(segments.filter((each) => each.marks).map(({ text, marks }) => ({ text, marks }))).toEqual([
      { text: '2...f6', marks: [{ from: 'f7', to: 'f6', kind: 'idea' }] },
      { text: 'f6', marks: [{ from: 'f6', to: 'f6', kind: 'idea' }] },
      { text: 'f8', marks: [{ from: 'f8', to: 'f8', kind: 'idea' }] }
    ]);
  });

  it('lights a whole rank or file, and each square of a list', () => {
    const segments = noteSegments('Control the fifth rank: c5, d5, e5 and the c-file.', []);
    const marked = segments.filter((each) => each.marks);
    expect(marked.map((each) => each.text)).toEqual(['fifth rank', 'c5', 'd5', 'e5', 'c-file']);
    expect(marked[0]!.marks!.map((each) => each.from)).toEqual(['a5', 'b5', 'c5', 'd5', 'e5', 'f5', 'g5', 'h5']);
    expect(marked[4]!.marks).toHaveLength(8);
  });

  it('makes moves written in a row a line, ending at the first that does not follow on', () => {
    const note = 'Not 2...Nc6 (developing) 3 Bb5 a6!, but 2...d6 3.d4 or 5...O-O 3.d4.';
    const lines = noteSegments(note, [AFTER_E4_E5_NF3]).filter((each) => each.marks);
    expect(lines.map(({ text, line }) => ({ text, sans: line?.sans }))).toEqual([
      { text: '2...Nc6 (developing) 3 Bb5 a6!', sans: ['Nc6', 'Bb5', 'a6'] },
      { text: '2...d6 3.d4', sans: ['d6', 'd4'] }
    ]);
    expect(lines[0]!.marks).toEqual([{ from: 'b8', to: 'c6', kind: 'idea' }]);
  });

  it('leaves a move that is not legal there as plain text', () => {
    expect(noteSegments('2...Qd4', [AFTER_E4_E5_NF3])).toEqual([{ text: '2...Qd4', start: 0 }]);
  });
});

describe('reading', () => {
  const text = 'One two. Three four five.\nSix seven.';
  it('splits sentences at stops and paragraphs, not at a move number', () => {
    expect(sentenceRanges(text).map((each) => text.slice(each.start, each.end))).toEqual(['One two.', 'Three four five.', 'Six seven.']);
    expect(sentenceRanges('See 2. Nf3 now.')).toHaveLength(1);
  });

  it('finds the sentence a recording is in', () => {
    expect(readingSentence(text, 0)).toBe(0);
    expect(readingSentence(text, 0.5)).toBe(1);
    expect(readingSentence(text, 1)).toBe(2);
    expect(sentenceStart(text, 0)).toBe(0);
    expect(readingSentence(text, sentenceStart(text, 2) + 0.001)).toBe(2);
  });
});
