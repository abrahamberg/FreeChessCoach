import { describe, expect, test } from 'vitest';
import { inspectMoves } from '@freechesscoach/chess-analysis';
import { renderMoveInspection } from './move-inspection-summary.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('renderMoveInspection', () => {
  test('states the side to move and how many legal moves there are', () => {
    const text = renderMoveInspection(inspectMoves(START, []));

    expect(text).toContain('white to move');
    expect(text).toContain('20 legal moves');
  });

  test('a legal move is named with what it does and the fen it reaches', () => {
    const text = renderMoveInspection(inspectMoves(START, ['e4']));

    expect(text).toContain('e4: legal (white pawn e2-e4)');
    expect(text).toContain('Resulting fen: ');
  });

  test('an illegal move is called illegal in plain words, with what that piece can do instead', () => {
    const text = renderMoveInspection(inspectMoves(START, ['Nf6']));

    expect(text).toContain('NOT LEGAL in this position');
    expect(text).toContain('do not tell the student this move is playable');
    expect(text).toContain('Nf3');
  });

  test('a move that hangs the mover says whose piece is left hanging', () => {
    const text = renderMoveInspection(inspectMoves('4k3/8/4p3/3p4/8/8/8/3QK3 w - - 0 1', ['Qxd5']));

    expect(text).toContain('takes the pawn');
    expect(text).toContain('white leaves hanging: white queen on d5');
  });

  test('an unreadable fen is reported as an error, never as a position', () => {
    const text = renderMoveInspection(inspectMoves('nonsense', ['e4']));

    expect(text).toContain('Could not read that position');
    expect(text).not.toContain('legal (');
  });

  test('a mating move is named as mate', () => {
    const text = renderMoveInspection(inspectMoves('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4', ['Qxf7#']));

    expect(text).toContain('checkmate');
  });

  test('the position\'s own hanging pieces and favorable captures are stated once, before the moves', () => {
    const text = renderMoveInspection(inspectMoves('4k3/8/8/8/3n4/4P3/8/4K3 w - - 0 1', []));

    expect(text).toContain('Hanging right now: black knight on d4');
    expect(text).toContain('Favorable captures available: exd4');
  });
});
