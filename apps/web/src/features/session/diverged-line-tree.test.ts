import { describe, expect, test } from 'vitest';
import { parsePgnTree } from '@freechesscoach/chess-analysis';
import { divergedLineOf } from './diverged-line-tree.js';

const TREE = parsePgnTree('1. e4 e5 2. Nf3 (2. Bc4 Nf6 3. d3) 2... Nc6 *');
const idOf = (san: string): string => TREE.nodes.find((node) => node.san === san)?.id ?? '';

describe('divergedLineOf', () => {
  test('a node of the game itself is no diverged line', () => {
    expect(divergedLineOf(TREE, idOf('Nf3'))).toBeNull();
    expect(divergedLineOf(TREE, null)).toBeNull();
  });

  test('a variation is told as its branch point and all its moves, the step counting the played ones', () => {
    const result = divergedLineOf(TREE, idOf('Nf6'));

    expect(result?.line.basePly).toBe(2);
    expect(result?.line.baseFen).toBe(TREE.nodes.find((node) => node.san === 'e5')?.fenAfter);
    expect(result?.line.moves.map((move) => move.san)).toEqual(['Bc4', 'Nf6', 'd3']);
    expect(result?.line.moves[0]?.uci).toBe('f1c4');
    expect(result?.stepIndex).toBe(2);
  });

  test('a variation from the first move branches at ply 0, from the start position', () => {
    const tree = parsePgnTree('1. e4 (1. d4 d5) 1... e5 *');
    const result = divergedLineOf(tree, tree.nodes.find((node) => node.san === 'd4')?.id ?? '');

    expect(result?.line.basePly).toBe(0);
    expect(result?.line.baseFen).toBe(tree.startFen);
    expect(result?.line.moves.map((move) => move.san)).toEqual(['d4', 'd5']);
    expect(result?.stepIndex).toBe(1);
  });
});
