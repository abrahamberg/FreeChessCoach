import { describe, expect, test } from 'vitest';
import { exchangeGain, lineGain, mentionOn, mentions } from './oracle.js';

/** The audit's own board checks. A wrong check invents errors (or hides
 * them) across the whole corpus, so each one that misfired once stays here
 * on the position that showed it. */
describe('review audit oracle', () => {
  test('a piece defended as often as it is attacked, by an equal trade, cannot be won (the owner game, 13…Bd3)', () => {
    const afterBd3 = 'r2r2k1/p1p2ppp/2n5/1pB1N3/8/2Pb1N2/PP3PPP/R4RK1 w - - 1 14';
    expect(exchangeGain(afterBd3, 'd3', 'w')).toBe(0);
  });

  test('an undefended piece can be won whole', () => {
    expect(exchangeGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', 'd5', 'w')).toBe(3);
  });

  test('a pinned attacker does not count', () => {
    // The white knight on d4 is pinned to its king by the rook on d8.
    expect(exchangeGain('3rk3/8/8/4b3/3N4/8/8/3K4 w - - 0 1', 'e5', 'w')).toBe(0);
  });

  test('mentions read colour, piece and square, and a named piece must stand there', () => {
    const found = mentions('unveils the rook on d1 against the black queen on d6');
    expect(found.map((mention) => `${mention.color ?? '-'}${mention.piece}${mention.square}`)).toEqual(['-rd1', 'bqd6']);
    const afterQxc7 = '8/2Q3pp/8/1pBk4/5p2/2Pr4/P4PPP/R5K1 b - - 0 25';
    expect(found.some((mention) => mentionOn(afterQxc7, mention))).toBe(false);
  });

  test('material over a line is counted for the side asked', () => {
    expect(lineGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', ['Rxd5'], 'w')).toBe(3);
    expect(lineGain('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1', ['Rxd5'], 'b')).toBe(-3);
  });
});
