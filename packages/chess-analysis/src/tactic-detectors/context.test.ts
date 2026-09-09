import { describe, expect, test } from 'vitest';
import { buildAttackMap } from '../attack-map.js';
import { buildTacticDetectionContext, isRecapture } from './context.js';

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

describe('isRecapture', () => {
  // 1.e4 e5 2.Nf3 Nc6 3.Bc4 d6 4.Bb5 Bd7 5.d4 exd4 6.Bxc6 — Black to move,
  // and bxc6 takes back the bishop that just took on c6.
  const AFTER_BXC6 = 'r2qkbnr/pppb1ppp/2Bp4/8/3pP3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 6';

  test('recognises a capture on the square the opponent just captured on', () => {
    const context = buildTacticDetectionContext(AFTER_BXC6, 'bxc6', 'black', { from: 'b5', to: 'c6', wasCapture: true });
    expect(isRecapture(context)).toBe(true);
  });

  test('a capture elsewhere is not a recapture', () => {
    const context = buildTacticDetectionContext(AFTER_BXC6, 'Bxc6', 'black', { from: 'e2', to: 'e4', wasCapture: false });
    expect(isRecapture(context)).toBe(false);
  });

  test('unknown history reads as not a recapture rather than guessing', () => {
    // A puzzle FEN arrives with no preceding move. The gates that reject a
    // recapture must not reject on an assumption.
    expect(isRecapture(buildTacticDetectionContext(AFTER_BXC6, 'bxc6', 'black'))).toBe(false);
  });
});
