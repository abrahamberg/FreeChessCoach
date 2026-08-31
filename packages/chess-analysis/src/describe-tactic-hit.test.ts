import { describe, expect, test } from 'vitest';
import { describeTacticHit } from './describe-tactic-hit.js';

describe('describeTacticHit', () => {
  test('fork: names the forking piece, its square, and the forked squares', () => {
    const text = describeTacticHit('fork', '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1', 'Nd6+', 'white');
    expect(text).toBe('knight on d6 forks e8 and b7');
  });

  test('pin: names the pinned piece and what it is pinned against', () => {
    const text = describeTacticHit('pin', '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1', 'Bb5', 'white');
    expect(text).toBe('pins the knight on c6 against e8');
  });

  test('skewer: names the front piece forced to move and the piece exposed behind it', () => {
    const text = describeTacticHit('skewer', 'r7/8/8/k7/8/8/8/1R5K w - - 0 1', 'Ra1+', 'white');
    expect(text).toBe('skewers the king on a5, exposing the rook on a8');
  });

  test('trappedPiece: names the cornered piece and its square', () => {
    const text = describeTacticHit('trappedPiece', 'n6k/8/8/3N4/8/8/8/R3K3 w - - 0 1', 'Kf1', 'white');
    expect(text).toBe('knight on a8 is trapped');
  });

  test('freePiece: names the undefended captured piece', () => {
    const text = describeTacticHit('freePiece', '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1', 'Bxd5', 'white');
    expect(text).toBe('captures the undefended queen on d5');
  });

  test('overloadedDefender: names the overloaded defender and its other duty', () => {
    const text = describeTacticHit('overloadedDefender', '1r5k/3n4/5b2/8/8/8/4K3/1RR5 w - - 0 1', 'Rf1', 'white');
    expect(text).toBe('overloads the knight on d7, which must also guard b8 and f6');
  });

  test('removesDefender: names the captured defender and the piece it leaves exposed', () => {
    const text = describeTacticHit('removesDefender', '4k3/1p6/B1n5/8/8/8/8/4K3 w - - 0 1', 'Bxb7', 'white');
    expect(text).toBe('removes the defender on b7, leaving the piece on c6 undefended');
  });

  test('discoveredAttack: names the piece whose line opened and the square it now hits', () => {
    const text = describeTacticHit('discoveredAttack', 'k7/8/8/N7/8/8/8/R3K3 w - - 0 1', 'Nb3', 'white');
    expect(text).toBe('rook on a1 gains a discovered attack on a8');
  });

  test('weakBackRank: names the checking piece and the boxed-in king', () => {
    const text = describeTacticHit('weakBackRank', '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1', 'Ra8#', 'white');
    expect(text).toBe('rook on a8 checks the king on g8, boxed in on the back rank');
  });

  test('doubleCheck: names the king and both checking squares', () => {
    const text = describeTacticHit('doubleCheck', '7k/8/8/4N3/8/8/8/Q6K w - - 0 1', 'Nf7+', 'white');
    expect(text).toBe('checks the king on h8 from f7 and a1 at once');
  });

  test('returns null for a type with no detector-specific shape to describe', () => {
    expect(describeTacticHit('other', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4', 'white')).toBeNull();
    expect(describeTacticHit('checkmate', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4', 'white')).toBeNull();
  });

  test('returns null when moveSan does not replay legally from fenBefore', () => {
    expect(describeTacticHit('fork', '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1', 'Qxa8', 'white')).toBeNull();
  });
});
