import { describe, expect, test } from 'vitest';
import { tokenizePgnMovetext, type PgnToken } from './tokens.js';

type MoveToken = Extract<PgnToken, { type: 'move' }>;

function moves(movetext: string): MoveToken[] {
  return tokenizePgnMovetext(movetext, 1).filter((token): token is MoveToken => token.type === 'move');
}

describe('tokenizePgnMovetext: move numbers', () => {
  test.each([
    ['12.e4', 'e4', { moveNumber: 12, black: false }],
    ['12. e4', 'e4', { moveNumber: 12, black: false }],
    ['12...Nf6', 'Nf6', { moveNumber: 12, black: true }],
    ['12... Nf6', 'Nf6', { moveNumber: 12, black: true }],
    ['12… Nf6', 'Nf6', { moveNumber: 12, black: true }],
    ['12…Nf6', 'Nf6', { moveNumber: 12, black: true }]
  ])('%s gives %s numbered %j', (text, san, numbered) => {
    expect(moves(text).map((move) => [move.san, move.numbered])).toEqual([[san, numbered]]);
  });

  test('a move after another move has no number of its own', () => {
    expect(moves('1. e4 e5').map((move) => move.numbered)).toEqual([{ moveNumber: 1, black: false }, null]);
  });
});

describe('tokenizePgnMovetext: glyphs', () => {
  test.each([
    ['Nd4?!', '?!'],
    ['Nxe5 ??', '??'],
    ['Qg5 $1', '!'],
    ['Qg5 $2', '?'],
    ['Qg5 $3', '!!'],
    ['Qg5 $4', '??'],
    ['Qg5 $5', '!?'],
    ['Qg5 $6', '?!'],
    ['Qg5! {why} ?', '?']
  ])('%s gives glyph %s', (text, glyph) => {
    expect(moves(text).map((move) => [move.san, move.glyph])).toEqual([[text.split(/[ !?]/)[0], glyph]]);
  });

  test('a move with no glyph has none, and other NAGs are ignored', () => {
    expect(moves('e4 $14').map((move) => move.glyph)).toEqual([null]);
  });

  test('a later glyph replaces the first, and a glyph never reaches the next move', () => {
    expect(moves('e4! $2 e5').map((move) => move.glyph)).toEqual(['?', null]);
  });
});
