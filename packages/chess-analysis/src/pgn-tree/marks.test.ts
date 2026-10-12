import { describe, expect, test } from 'vitest';
import { parsePgnComment } from './comment.js';
import { parsePgnTree, type PgnMark } from './parse.js';

function marksBySan(pgn: string): Record<string, PgnMark[]> {
  const tree = parsePgnTree(pgn);
  return Object.fromEntries(tree.nodes.map((node) => [node.san, node.marks]));
}

describe('marks after a move', () => {
  test('bare, and inside the move’s comment, mark that move', () => {
    expect(marksBySan('1. e4 @key e5 {the point @quiz} 2. Nf3 *')).toEqual({ e4: ['key'], e5: ['quiz'], Nf3: [] });
  });

  test('several marks on one move come out in a fixed order, whichever way they were written', () => {
    expect(marksBySan('1. e4 @reel @key @slow')['e4']).toEqual(['key', 'slow', 'reel']);
    expect(marksBySan('1. e4 @slow @key @reel')['e4']).toEqual(['key', 'slow', 'reel']);
  });

  test('the comment keeps its words and loses the marks', () => {
    expect(parsePgnComment('the point @quiz here')).toMatchObject({ text: 'the point here', marks: ['quiz'] });
  });

  test('an @word that is not a mark stays text inside a comment', () => {
    expect(parsePgnComment('thanks @GothamChess, mail me@key.com')).toMatchObject({ text: 'thanks @GothamChess, mail me@key.com', marks: [] });
  });
});

describe('pace marks over a stretch', () => {
  test('@fast on a section head covers the moves the section adds', () => {
    expect(marksBySan('1. e4 e5\n---\n@fast\n2. Nf3 Nc6')).toEqual({ e4: [], e5: [], Nf3: ['fast'], Nc6: ['fast'] });
  });

  test('@slow before a variation’s first move covers it, nested variations too, and stops at its end', () => {
    const marks = marksBySan('1. e4 e5 (@slow 1... c5 2. Nf3 (2. c3 d5) d6) 2. Nf3 *');

    expect(marks).toMatchObject({ c5: ['slow'], c3: ['slow'], d5: ['slow'], d6: ['slow'] });
    expect(marks['e5']).toEqual([]);
  });

  test('a move with its own pace mark keeps it, and a point never becomes fast by scope', () => {
    const marks = marksBySan('@fast\n1. e4 @slow e5 2. Nf3 @key Nc6 3. Bb5!');

    expect(marks).toEqual({ e4: ['slow'], e5: ['fast'], Nf3: ['key'], Nc6: ['fast'], Bb5: [] });
  });
});

describe('mark errors', () => {
  function messages(pgn: string): string[] {
    return parsePgnTree(pgn).errors.map((error) => error.message);
  }

  test.each([
    ['1. e4 @fast @key', '@key cannot go with @fast'],
    ['1. e4 @key @fast', '@fast cannot go with @key'],
    ['1. e4 @fast @slow', '@slow cannot go with @fast'],
    ['1. e4! @fast', '@fast cannot go with !'],
    ['1. e4 @fast @quiz', '@quiz cannot go with @fast']
  ])('%s is an error', (pgn, text) => {
    expect(messages(pgn)[0]).toContain(text);
  });

  test('an unknown bare mark lists the marks, with its line', () => {
    const [error] = parsePgnTree('1. e4 e5\n2. Nf3 @best').errors;

    expect(error?.message).toContain('Unknown mark @best');
    expect(error?.message).toContain('@key, @quiz, @slow, @fast, @reel');
    expect(error?.pgnLine).toBe(2);
  });

  test('a mark other than the pace marks cannot stand in a head', () => {
    expect(messages('1. e4 e5\n---\n@key\n2. Nf3')[0]).toContain('@key marks one move');
  });

  test('@reel on two moves is an error on the second', () => {
    const [error] = parsePgnTree('1. e4 @reel e5\n2. Nf3 @reel').errors;

    expect(error?.message).toContain('@reel can mark only one move');
    expect(error?.pgnLine).toBe(2);
  });
});
