import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { mainLine } from '@freechesscoach/chess-analysis';
import { anchorPly, back, gameTree, initialMoveTree, mainNodeAtPly, play, qualitiesByMainNode, remove, select, type MoveTreeState } from './move-tree-state.js';

const MOVES = ['e4', 'e5', 'Nf3', 'Nc6'];

function started(): MoveTreeState {
  return initialMoveTree(gameTree(DEFAULT_POSITION, MOVES, '1. e4 e5 2. Nf3 Nc6 *'));
}

function played(state: MoveTreeState, ...sans: string[]): MoveTreeState {
  return sans.reduce((current, san) => {
    const next = play(current, san);
    if (!next) throw new Error(`illegal ${san}`);
    return next;
  }, state);
}

describe('gameTree', () => {
  test('uses the PGN\'s variations when its main line is the game', () => {
    const tree = gameTree(DEFAULT_POSITION, MOVES, '1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6 *');

    expect(tree.nodes.map((node) => node.san)).toContain('Bc4');
    expect(mainLine(tree).map((node) => node.san)).toEqual(MOVES);
  });

  test('is just the line when the PGN\'s main line differs from the analysed game', () => {
    const tree = gameTree(DEFAULT_POSITION, MOVES, '1. d4 d5 (1... Nf6) *');

    expect(tree.nodes.map((node) => node.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(tree.nodes.map((node) => node.parentId)).toEqual([null, 'n1', 'n2', 'n3']);
  });
});

describe('play', () => {
  test('a new move from the current node is a variation; the same move again follows it', () => {
    const atE4 = select(started(), 'n1');
    const first = played(atE4, 'c5');
    const again = play(select(atE4, 'n1'), 'c5');

    expect(first.currentId).toBe('x1');
    expect(again?.currentId).toBe('x1');
    expect(again?.tree.nodes).toHaveLength(first.tree.nodes.length);
  });

  test('two different moves from one position are two variations that both stay', () => {
    const atE4 = select(started(), 'n1');
    const both = played(select(played(atE4, 'c5'), 'n1'), 'e6');

    expect(both.tree.nodes.filter((node) => node.parentId === 'n1').map((node) => node.san)).toEqual(['e5', 'c5', 'e6']);
  });

  test('an illegal move is null', () => {
    expect(play(started(), 'Ke2')).toBeNull();
  });
});

describe('exploring from the last position', () => {
  test('the first move explored there is a variation, not a longer game', () => {
    const state = played(select(started(), 'n4'), 'Bb5');

    expect(state.currentId).toBe('x1');
    expect(anchorPly(state.tree, state.currentId)).toBe(4);
    expect(back(state).currentId).toBe('n4');
    expect(mainNodeAtPly(state.tree, 5)).toBeNull();
  });
});

describe('select, back and anchorPly', () => {
  test('stepping the game keeps the variations', () => {
    const state = select(played(select(started(), 'n1'), 'c5', 'Nf3'), 'n4');

    expect(state.currentId).toBe('n4');
    expect(state.tree.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(['x1', 'x2']));
  });

  test('an unknown id changes nothing', () => {
    const state = started();

    expect(select(state, 'nope')).toBe(state);
  });

  test('back goes to the last main-line move on the way; anchorPly counts the main-line moves', () => {
    const inVariation = played(select(started(), 'n2'), 'Nc3', 'Nf6');

    expect(inVariation.currentId).toBe('x2');
    expect(anchorPly(inVariation.tree, inVariation.currentId)).toBe(2);
    expect(back(inVariation).currentId).toBe('n2');
    expect(back(select(started(), 'n3')).currentId).toBe('n3');
    expect(anchorPly(started().tree, null)).toBe(0);
  });
});

describe('remove', () => {
  test('removes the student\'s variation with its moves and leaves the current node at its parent', () => {
    const state = played(select(started(), 'n2'), 'Nc3', 'Nf6');
    const removed = remove(state, 'x1');

    expect(removed.tree.nodes.map((node) => node.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(removed.currentId).toBe('n2');
  });

  test('never removes the game\'s own nodes', () => {
    const state = started();

    expect(remove(state, 'n2')).toBe(state);
  });

  test('a PGN variation is part of the game and stays', () => {
    const state = initialMoveTree(gameTree(DEFAULT_POSITION, MOVES, '1. e4 e5 2. Nf3 (2. Bc4) 2... Nc6 *'));
    const sideline = state.tree.nodes.find((node) => node.san === 'Bc4');

    expect(remove(state, sideline?.id ?? '')).toBe(state);
  });
});

describe('main-line lookups', () => {
  test('mainNodeAtPly and qualitiesByMainNode use the main line, not the variations', () => {
    const state = played(select(started(), 'n2'), 'Nc3');
    const quality = { ply: 3 };

    expect(mainNodeAtPly(state.tree, 3)).toBe('n3');
    expect(mainNodeAtPly(state.tree, 0)).toBeNull();
    expect(qualitiesByMainNode(state.tree, [quality])).toEqual({ n3: quality });
  });
});
