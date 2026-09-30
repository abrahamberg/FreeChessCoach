import { describe, expect, test } from 'vitest';
import { exchangeLoss, settledLine } from './material.js';

// The Englund after 5…Qxb2 6.Bc3: Black's queen on b2, a pawn down.
const AFTER_BC3 = 'r1b1kbnr/pppp1ppp/2n5/4P3/8/2B2N2/PqP1PPPP/RN1QKB1R b KQkq - 1 6';

describe('material over an exchange', () => {
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
