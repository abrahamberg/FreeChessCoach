import { describe, expect, test } from 'vitest';
import { tacticHitVisual } from './tactic-hit-visual.js';

describe('tacticHitVisual', () => {
  test('fork: one arrow from the forking piece to each forked square', () => {
    const visual = tacticHitVisual('fork', '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1', 'Nd6+', 'white');
    expect(visual).toEqual({
      arrows: [
        { from: 'd6', to: 'e8' },
        { from: 'd6', to: 'b7' }
      ],
      highlights: []
    });
  });

  test('pin: an arrow from pinner to the piece behind, highlighting the pinned piece', () => {
    const visual = tacticHitVisual('pin', '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1', 'Bb5', 'white');
    expect(visual).toEqual({ arrows: [{ from: 'b5', to: 'e8' }], highlights: ['c6'] });
  });

  test('skewer: an arrow from attacker to the exposed piece, highlighting the front piece', () => {
    const visual = tacticHitVisual('skewer', 'r7/8/8/k7/8/8/8/1R5K w - - 0 1', 'Ra1+', 'white');
    expect(visual).toEqual({ arrows: [{ from: 'a1', to: 'a8' }], highlights: ['a5'] });
  });

  test('trappedPiece: no arrow, just a highlight on the cornered piece', () => {
    const visual = tacticHitVisual('trappedPiece', 'n6k/8/8/3N4/8/8/8/R3K3 w - - 0 1', 'Kf1', 'white');
    expect(visual).toEqual({ arrows: [], highlights: ['a8'] });
  });

  test('freePiece: an arrow for the capture itself', () => {
    const visual = tacticHitVisual('freePiece', '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1', 'Bxd5', 'white');
    expect(visual).toEqual({ arrows: [{ from: 'c4', to: 'd5' }], highlights: [] });
  });

  test('returns null for a type with no detector-specific shape to describe', () => {
    expect(tacticHitVisual('other', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4', 'white')).toBeNull();
  });

  test('returns null when moveSan does not replay legally from fenBefore', () => {
    expect(tacticHitVisual('fork', '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1', 'Qxa8', 'white')).toBeNull();
  });
});
