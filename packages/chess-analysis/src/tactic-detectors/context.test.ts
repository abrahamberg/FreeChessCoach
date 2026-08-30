import { describe, expect, test } from 'vitest';
import { buildAttackMap } from '../attack-map.js';
import { buildTacticDetectionContext } from './context.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('buildTacticDetectionContext', () => {
  test('populates after/afterAttackMap/destination for a legal move', () => {
    const context = buildTacticDetectionContext(FORK_FEN, 'Nd6+', 'white');

    expect(context.mover).toBe('w');
    expect(context.destination).toBe('d6');
    expect(context.after).not.toBeNull();
    expect(context.afterAttackMap).not.toBeNull();
    const expectedAttackMap = buildAttackMap(context.after!);
    expect(context.afterAttackMap!.attackersOf.get('d6')).toEqual(expectedAttackMap.attackersOf.get('d6'));
  });

  test('leaves after/afterAttackMap/destination null for an illegal move, without throwing', () => {
    const context = buildTacticDetectionContext(QUIET_FEN, 'Qh5+', 'white');

    expect(context.destination).toBeNull();
    expect(context.after).toBeNull();
    expect(context.afterAttackMap).toBeNull();
  });
});
