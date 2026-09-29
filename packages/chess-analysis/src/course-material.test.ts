import { describe, expect, test } from 'vitest';
import { captureWords, exchangeLoss, materialBalance, settledLine } from './course-material.js';

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

  test('a line never ends mid-exchange', () => {
    // 5…Qe7 6.Nc3 Nxe5 7.e4 Nf6 8.Nxe5: the engine's line stops before …Qxe5.
    const afterBd2 = 'r1b1kbnr/pppp1ppp/2n5/4P3/1q6/5N2/PPPBPPPP/RN1QKB1R b KQkq - 5 5';
    expect(settledLine(afterBd2, ['Qe7', 'Nc3', 'Nxe5', 'e4', 'Nf6', 'Nxe5'])).toEqual(['Qe7', 'Nc3', 'Nxe5', 'e4', 'Nf6']);
    // A capture nobody can take back stays.
    expect(settledLine('4k3/8/8/8/8/8/p7/R3K3 w - - 0 1', ['Rxa2'])).toEqual(['Rxa2']);
  });
});
