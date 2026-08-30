import { describe, expect, test } from 'vitest';
import { classifyTacticMotif, type TacticMotifContext } from './classify-tactic-motif.js';

const FORK_FEN = '4k3/1r6/8/8/2N5/8/8/K7 w - - 0 1';
const PIN_FEN = '4k3/8/2n5/8/8/3B4/8/4K3 w - - 0 1';
const FREE_PIECE_FEN = '7k/8/8/3q4/2B5/8/8/4K3 w - - 0 1';
const QUIET_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function contextFor(overrides: Partial<TacticMotifContext> & Pick<TacticMotifContext, 'fenBefore' | 'moveSan'>): TacticMotifContext {
  return {
    mover: 'white',
    quality: 'best',
    isCheckmate: false,
    isTacticalPosition: true,
    ...overrides
  };
}

describe('classifyTacticMotif', () => {
  test('checkmate takes priority over every other motif', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+', isCheckmate: true });

    expect(classifyTacticMotif(context)).toBe('checkmate');
  });

  test('a brilliant-classified move is tagged brilliantSacrifice ahead of fork', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+', quality: 'brilliant' });

    expect(classifyTacticMotif(context)).toBe('brilliantSacrifice');
  });

  test('tags a fork-creating move', () => {
    const context = contextFor({ fenBefore: FORK_FEN, moveSan: 'Nd6+' });

    expect(classifyTacticMotif(context)).toBe('fork');
  });

  test('tags a pin-creating move', () => {
    const context = contextFor({ fenBefore: PIN_FEN, moveSan: 'Bb5' });

    expect(classifyTacticMotif(context)).toBe('pin');
  });

  test('tags capturing an undefended piece as a free piece', () => {
    const context = contextFor({ fenBefore: FREE_PIECE_FEN, moveSan: 'Bxd5' });

    expect(classifyTacticMotif(context)).toBe('freePiece');
  });

  test('falls back to "other" for a tactical position matching no named motif', () => {
    const context = contextFor({ fenBefore: QUIET_FEN, moveSan: 'e4', isTacticalPosition: true });

    expect(classifyTacticMotif(context)).toBe('other');
  });

  test('returns null outside a tactical position', () => {
    const context = contextFor({ fenBefore: QUIET_FEN, moveSan: 'e4', isTacticalPosition: false });

    expect(classifyTacticMotif(context)).toBeNull();
  });
});
