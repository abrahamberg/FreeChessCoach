import { describe, expect, test } from 'vitest';
import { completedSentences } from './streamingSentences.js';

describe('completedSentences', () => {
  test('holds back the sentence still being written', () => {
    expect(completedSentences('Good move. Now look at', false)).toEqual(['Good move.']);
  });

  test('waits for the next sentence to start before calling one complete', () => {
    expect(completedSentences('Good move.', false)).toEqual([]);
    expect(completedSentences('Good move. ', false)).toEqual([]);
    expect(completedSentences('Good move. W', false)).toEqual(['Good move.']);
  });

  test('includes the trailing remainder once the reply is final', () => {
    expect(completedSentences('Good move. What now?', true)).toEqual(['Good move.', 'What now?']);
    expect(completedSentences('No ending punctuation', true)).toEqual(['No ending punctuation']);
  });

  test('never splits on a move number', () => {
    expect(completedSentences('After 24. a4 the knight is stuck. Why', false)).toEqual([
      'After 24. a4 the knight is stuck.'
    ]);
  });

  test("never splits on a black move number's dots", () => {
    expect(completedSentences('After 26... c6 White is fine. Next', false)).toEqual(['After 26... c6 White is fine.']);
  });

  test('ends a sentence on a square', () => {
    expect(completedSentences('It attacks the knight on f3. Black', false)).toEqual(['It attacks the knight on f3.']);
  });

  test('keeps closing quotes and bold markers with their sentence', () => {
    expect(completedSentences('Try **Qh5!** Then "why?" Next', false)).toEqual(['Try **Qh5!**', 'Then "why?"']);
  });

  test('earlier sentences never change as more text streams in', () => {
    const reply = 'First idea. Second idea! Third idea? Done.';
    let previous: string[] = [];
    for (let length = 1; length <= reply.length; length++) {
      const current = completedSentences(reply.slice(0, length), false);
      expect(current.slice(0, previous.length)).toEqual(previous);
      previous = current;
    }
    expect(completedSentences(reply, true)).toEqual(['First idea.', 'Second idea!', 'Third idea?', 'Done.']);
  });
});
