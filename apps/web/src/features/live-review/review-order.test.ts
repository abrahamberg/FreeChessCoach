import { lineTree } from '@freechesscoach/chess-analysis';
import { describe, expect, it } from 'vitest';
import { reviewOrder } from './review-order.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('reviewOrder', () => {
  const tree = lineTree(START, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  const fenAfter = (id: string): string => tree.nodes.find((node) => node.id === id)?.fenAfter ?? '';

  it('does the move on the board, then the last move, then the ones in between nearest first', () => {
    const fens = reviewOrder(tree, 'x3', 'x6');
    expect(fens.slice(0, 2)).toEqual([fenAfter('x2'), fenAfter('x3')]);
    expect(fens.slice(2, 4)).toEqual([fenAfter('x5'), fenAfter('x6')]);
    // Move 2 is next to the board (it also needs move 1's position); move 1 is two away and last.
    expect(fens.indexOf(fenAfter('x4'))).toBeLessThan(fens.indexOf(START));
  });

  it('starts with the start position when the board is on it, and lists each position once', () => {
    const fens = reviewOrder(tree, null, 'x6');
    expect(fens[0]).toBe(START);
    expect(new Set(fens).size).toBe(fens.length);
    expect(fens).toHaveLength(7);
  });
});
