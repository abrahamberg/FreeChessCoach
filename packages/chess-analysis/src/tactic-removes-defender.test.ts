import { describe, expect, test } from 'vitest';
import { removesDefender } from './tactic-removes-defender.js';

describe('removesDefender', () => {
  test('capturing the sole defender of a hanging piece qualifies', () => {
    const fen = '4k3/1p6/B1n5/8/8/8/8/4K3 w - - 0 1';

    expect(removesDefender(fen, 'Bxb7', 'w')).toEqual({ capturedDefender: 'b7', exposedTarget: 'c6' });
  });

  test('capturing a piece that still leaves a second defender does not qualify', () => {
    const fen = '4k3/1p1p4/B1n5/8/8/8/8/4K3 w - - 0 1';

    expect(removesDefender(fen, 'Bxb7', 'w')).toBeNull();
  });

  test('a capture that defends nothing else does not qualify', () => {
    const fen = '4k3/1p6/B7/8/8/8/8/4K3 w - - 0 1';

    expect(removesDefender(fen, 'Bxb7', 'w')).toBeNull();
  });

  test('a non-capturing move never qualifies', () => {
    const fen = '4k3/1p6/B1n5/8/8/8/8/4K3 w - - 0 1';

    expect(removesDefender(fen, 'Kd2', 'w')).toBeNull();
  });
});
