import { describe, expect, test } from 'vitest';
import { inspectMoves } from '@freechesscoach/chess-analysis';
import { renderMoveInspection } from './move-inspection-summary.js';

describe('renderMoveInspection', () => {
  test('lists the loose pieces of both sides, each with why it is loose', () => {
    // The black knight on d4 is attacked by the e3 pawn and undefended; the white knight on f3 is attacked by the e4 pawn and defended.
    const text = renderMoveInspection(inspectMoves('4k3/8/8/8/3nP3/4PN2/8/4K3 b - - 0 1', []));
    expect(text).toContain('Loose right now: ');
    expect(text).toContain('the black knight on d4 (undefended)');
  });

  test('a piece that can be won despite a defender reads "can be won"', () => {
    // The knight on d5 is defended by the e6 pawn but the c4 pawn takes it for free material-wise.
    const text = renderMoveInspection(inspectMoves('4k3/8/4p3/3n4/2P5/8/8/4K3 w - - 0 1', []));
    expect(text).toContain('the black knight on d5 (can be won)');
  });

  test('a checked move lists its facts and what it leaves loose', () => {
    const text = renderMoveInspection(inspectMoves('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', ['Qxd5']));
    expect(text).toContain('Qxd5: legal (white moves the queen from d1 to d5; captures the pawn on d5).');
    expect(text).toContain('After it, white leaves loose: the white queen on d5');
  });

  test('a trade is not a piece left loose', () => {
    const text = renderMoveInspection(inspectMoves('4k3/8/4p3/3p4/2P5/8/8/4K3 w - - 0 1', ['cxd5']));
    expect(text).not.toContain('leaves loose');
  });

  test('an illegal move is named illegal, with what that piece can do', () => {
    const text = renderMoveInspection(inspectMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['Nf6']));
    expect(text).toContain('Nf6: NOT LEGAL');
    expect(text).toContain('Nf3');
  });
});
