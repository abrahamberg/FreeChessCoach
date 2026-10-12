import { DEFAULT_POSITION } from 'chess.js';
import { describe, expect, test } from 'vitest';
import { addMove, childrenOf, gameLine, lineTree, mainLine, pathTo, removeBranch, type EditableTree } from './edit.js';
import { parsePgnTree } from './parse.js';

function added(tree: EditableTree, parentId: string | null, san: string): { tree: EditableTree; nodeId: string } {
  const result = addMove(tree, parentId, san);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('lineTree', () => {
  test('one line with ids x1…, each node the child of the one before', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4', 'e5', 'Nf3']);

    expect(tree.nodes.map((node) => `${node.id}:${node.parentId}:${node.san}`)).toEqual(['x1:null:e4', 'x2:x1:e5', 'x3:x2:Nf3']);
    expect(tree.nodes[0]?.uci).toBe('e2e4');
    expect(mainLine(tree).map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('addMove', () => {
  test('adding a move that exists changes nothing', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4', 'e5']);
    const result = addMove(tree, 'x1', 'e5');

    expect(result).toEqual({ ok: true, tree, nodeId: 'x2', added: false });
  });

  test('a different reply becomes a second child, after the first one\'s subtree', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4', 'e5', 'Nf3']);
    const { tree: next, nodeId } = added(tree, 'x1', 'c5');

    expect(nodeId).toBe('x4');
    expect(next.nodes.map((node) => node.id)).toEqual(['x1', 'x2', 'x3', 'x4']);
    expect(childrenOf(next, 'x1').map((node) => node.san)).toEqual(['e5', 'c5']);
    expect(mainLine(next).map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  test('an illegal move is an error and the tree is untouched', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4']);

    expect(addMove(tree, 'x1', 'Ke7')).toEqual({ ok: false, error: 'Illegal move Ke7' });
    expect(addMove(tree, 'zz', 'e5')).toEqual({ ok: false, error: 'No such node: zz' });
  });

  test('a move from the start is a root child', () => {
    const { tree } = added(lineTree(DEFAULT_POSITION, ['e4']), null, 'd4');

    expect(childrenOf(tree, null).map((node) => node.san)).toEqual(['e4', 'd4']);
  });

  test('a parsed tree gets x ids and keeps its n ids', () => {
    const parsed = parsePgnTree('1. e4 e5 2. Nf3 *');
    const { tree, nodeId } = added(parsed, 'n1', 'c5');

    expect(nodeId).toBe('x1');
    expect(tree.nodes.map((node) => node.id)).toEqual(['n1', 'n2', 'n3', 'x1']);
  });
});

describe('removeBranch', () => {
  test('add then remove gives the tree back', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4', 'e5', 'Nf3']);
    const { tree: withSide, nodeId } = added(tree, 'x1', 'c5');

    expect(removeBranch(withSide, nodeId).nodes).toEqual(tree.nodes);
  });

  test('removes the node with everything after it', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4', 'e5', 'Nf3']);

    expect(removeBranch(tree, 'x2').nodes.map((node) => node.id)).toEqual(['x1']);
  });

  test('an id is never reused after its branch is removed', () => {
    const tree = lineTree(DEFAULT_POSITION, ['e4']);
    const first = added(tree, 'x1', 'e5');
    const second = added(removeBranch(first.tree, first.nodeId), 'x1', 'c5');

    expect(first.nodeId).toBe('x2');
    expect(second.nodeId).toBe('x3');
  });
});

describe('gameLine', () => {
  test('a move explored from the last position is not part of the game', () => {
    const parsed = parsePgnTree('1. e4 e5 *');
    const result = addMove(parsed, 'n2', 'Nf3');
    if (!result.ok) throw new Error(result.error);

    expect(mainLine(result.tree).map((node) => node.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(gameLine(result.tree).map((node) => node.san)).toEqual(['e4', 'e5']);
  });
});

describe('pathTo', () => {
  test('the moves from the start to the node, inclusive', () => {
    const tree = parsePgnTree('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *');
    const sideline = tree.nodes.find((node) => node.san === 'Nf3' && node.parentId !== null && tree.nodes.find((p) => p.id === node.parentId)?.san === 'c5');

    expect(pathTo(tree, sideline?.id ?? '').map((node) => node.san)).toEqual(['e4', 'c5', 'Nf3']);
    expect(pathTo(tree, 'nope')).toEqual([]);
  });
});
