import { describe, expect, test } from 'vitest';
import { parsePgnTree } from '@freechesscoach/chess-analysis';
import { stripPath } from './variation-path.js';

const TREE = parsePgnTree('1. e4 e5 2. Nf3 (2. Bc4 Nf6 3. d3) 2... Nc6 *');

describe('stripPath', () => {
  test('on the game\'s line it is the whole game, the current move marked by ply', () => {
    const path = stripPath(TREE, 'n2');

    expect(path.sanMoves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(path.ply).toBe(2);
    expect(path.variationFromIndex).toBeNull();
    expect(path.positions).toHaveLength(5);
    expect(path.positions[0]?.fen).toBe(TREE.startFen);
  });

  test('in a variation it is the game up to the branch, then the variation to its end', () => {
    const bishop = TREE.nodes.find((node) => node.san === 'Bc4');
    const path = stripPath(TREE, bishop?.id ?? null);

    expect(path.sanMoves).toEqual(['e4', 'e5', 'Bc4', 'Nf6', 'd3']);
    expect(path.ply).toBe(3);
    expect(path.variationFromIndex).toBe(2);
  });

  test('at the start the strip is the main line with nothing played', () => {
    const path = stripPath(TREE, null);

    expect(path.ply).toBe(0);
    expect(path.sanMoves).toHaveLength(4);
  });
});
