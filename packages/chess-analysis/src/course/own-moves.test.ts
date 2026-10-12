import { describe, expect, test } from 'vitest';
import { courseLineGames } from './line-game.js';
import { ownMoves } from './own-moves.js';
import { parseCourseTree } from './tree.js';

describe('ownMoves', () => {
  test('the pieces together are every node of the tree, once', () => {
    const tree = parseCourseTree('1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 Nc6 *');
    const pieces = ownMoves(courseLineGames(tree));

    expect(pieces.flat().sort()).toEqual(tree.nodes.map((node) => node.id).sort());
  });

  test('a sideline has only the moves from where it branches', () => {
    const [main, side] = ownMoves(courseLineGames(parseCourseTree('1. e4 e5 2. Nf3 (2. f4 exf4) 2... Nc6 *')));

    expect(main).toHaveLength(4);
    expect(side).toHaveLength(2);
  });
});
