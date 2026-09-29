import { describe, expect, test } from 'vitest';
import { captureWords, exchangeLoss, materialBalance } from './course-material.js';

// The Englund after 5…Qxb2 6.Bc3: Black's queen on b2, a pawn down.
const AFTER_BC3 = 'r1b1kbnr/pppp1ppp/2n5/4P3/8/2B2N2/PqP1PPPP/RN1QKB1R b KQkq - 1 6';

describe('material words (§13.5)', () => {
  test('the balance on the board', () => {
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('material is level');
    expect(materialBalance(AFTER_BC3)).toBe('material is level');
    expect(materialBalance('4k3/8/8/8/8/8/PP6/4K1N1 w - - 0 1')).toBe('White is a knight and two pawns up');
    expect(materialBalance('4k1b1/8/8/8/8/8/P7/4K1N1 w - - 0 1')).toBe('White has a knight and a pawn for a bishop');
  });

  test('who takes what over a line, the mover first', () => {
    expect(captureWords(AFTER_BC3, ['Qxc3+', 'Nxc3'])).toBe('Black takes a bishop; White takes the queen');
    expect(captureWords(AFTER_BC3, ['Bb4'])).toBe('nothing is taken');
  });

  test("the mover's loss after the move and the reply", () => {
    expect(exchangeLoss(AFTER_BC3, 'Qxc3+', 'Nxc3')).toBe(6);
    expect(exchangeLoss(AFTER_BC3, 'Qxa1', 'Bxa1')).toBe(4);
    expect(exchangeLoss(AFTER_BC3, 'Bb4', 'Qd2')).toBe(0);
  });
});
