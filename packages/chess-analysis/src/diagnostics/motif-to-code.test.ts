import { describe, expect, test } from 'vitest';
import { motifToCode } from './motif-to-code.js';

const KNIGHT_FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const ABSOLUTE_PIN_FEN = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';
const RELATIVE_PIN_FEN = 'q3k3/8/2n5/8/6B1/8/8/4K3 w - - 0 1';

describe('motifToCode', () => {
  test('maps every direct (non-split) motif type to its one code', () => {
    expect(motifToCode('checkmate')).toBe('TA-01');
    expect(motifToCode('weakBackRank')).toBe('TA-04');
    expect(motifToCode('skewer')).toBe('TA-14');
    expect(motifToCode('discoveredAttack')).toBe('TA-16');
    expect(motifToCode('doubleCheck')).toBe('TA-17');
    expect(motifToCode('removesDefender')).toBe('TA-18');
    expect(motifToCode('overloadedDefender')).toBe('TA-19');
    expect(motifToCode('trappedPiece')).toBe('TA-26');
    expect(motifToCode('freePiece')).toBe('TA-43');
  });

  test('returns null for motif types with no catalog code', () => {
    expect(motifToCode('brilliantSacrifice')).toBeNull();
    expect(motifToCode('other')).toBeNull();
  });

  test('splits fork by forking piece', () => {
    expect(motifToCode('fork', { fenBefore: KNIGHT_FORK_FEN, moveSan: 'Nd6+' })).toBe('TA-07');
  });

  test('returns null for fork without a replay', () => {
    expect(motifToCode('fork')).toBeNull();
  });

  test('returns null for fork when the replayed move creates no fork', () => {
    const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(motifToCode('fork', { fenBefore: QUIET_FEN, moveSan: 'e4' })).toBeNull();
  });

  test('splits pin into absolute and relative by PinHit.kind', () => {
    expect(motifToCode('pin', { fenBefore: ABSOLUTE_PIN_FEN, moveSan: 'Bb5' })).toBe('TA-11');
    expect(motifToCode('pin', { fenBefore: RELATIVE_PIN_FEN, moveSan: 'Bf3' })).toBe('TA-12');
  });

  test('returns null for pin without a replay', () => {
    expect(motifToCode('pin')).toBeNull();
  });

  test('returns null when the replay move is illegal', () => {
    expect(motifToCode('fork', { fenBefore: KNIGHT_FORK_FEN, moveSan: 'Qz9' })).toBeNull();
  });
});
