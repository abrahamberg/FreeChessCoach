import type { EngineLine } from '@chess-coach/shared';
import { describe, expect, test } from 'vitest';
import { assertEvalSignConvention } from './assert-eval-sign.js';

const WHITE_TO_MOVE_FEN = '8/8/8/8/8/8/8/4K2k w - - 0 1';
const BLACK_TO_MOVE_FEN = '8/8/8/8/8/8/8/4K2k b - - 0 1';

function line(cp: number): EngineLine {
  return { moveUci: 'a1a2', moveSan: 'Ka2', cp, mateIn: null };
}

describe('assertEvalSignConvention', () => {
  test('accepts white-to-move lines ordered from highest to lowest cp', () => {
    expect(() => assertEvalSignConvention(WHITE_TO_MOVE_FEN, [line(40), line(10)])).not.toThrow();
  });

  test('accepts black-to-move lines ordered from lowest to highest cp', () => {
    expect(() => assertEvalSignConvention(BLACK_TO_MOVE_FEN, [line(-40), line(10)])).not.toThrow();
  });

  test('rejects deliberately flipped white-to-move lines', () => {
    expect(() => assertEvalSignConvention(WHITE_TO_MOVE_FEN, [line(10), line(40)])).toThrow(
      /white-to-move.*first line.*greater than or equal/i
    );
  });

  test('rejects deliberately flipped black-to-move lines', () => {
    expect(() => assertEvalSignConvention(BLACK_TO_MOVE_FEN, [line(10), line(-40)])).toThrow(
      /black-to-move.*first line.*less than or equal/i
    );
  });
});
