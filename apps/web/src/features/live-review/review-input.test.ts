import { describe, expect, it } from 'vitest';
import { readReviewInput } from './review-input.js';

describe('readReviewInput', () => {
  it('opens the standard start on nothing, and a FEN as given', () => {
    const start = readReviewInput('  ');
    expect(start.ok && start.tree.startFen.startsWith('rnbqkbnr/pppppppp')).toBe(true);
    const fen = readReviewInput('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(fen.ok && fen.tree.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });

  it('reads a PGN with its moves, and refuses a bad FEN and a PGN with no moves', () => {
    const pgn = readReviewInput('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 *');
    expect(pgn.ok && pgn.tree.nodes.map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(readReviewInput('8/8/8/8/8/8/8/8/8 w - - 0 1').ok).toBe(false);
    expect(readReviewInput('[Event "x"]\n\n*').ok).toBe(false);
  });
});
