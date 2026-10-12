import { describe, expect, test } from 'vitest';
import { parseCourseTree } from '@freechesscoach/chess-analysis';
import { explorerExtras, explorerTree } from './explorer-tree.js';

const TREE = parseCourseTree('1. e4 e5 2. Nf3 {The develop move} Nc6 3. Bc4 @key Bc5 *');

describe('explorerTree', () => {
  test('keeps every node, its parent and its position', () => {
    const tree = explorerTree(TREE);

    expect(tree.nodes.map((node) => `${node.id}:${node.parentId}:${node.san}`)).toEqual(TREE.nodes.map((node) => `${node.id}:${node.parentId}:${node.san}`));
    expect(tree.startFen).toBe(TREE.startFen);
  });
});

describe('explorerExtras', () => {
  test('marks become badges and a comment its tooltip; a plain move gets nothing', () => {
    const extras = explorerExtras(TREE);
    const nf3 = TREE.nodes.find((node) => node.san === 'Nf3');
    const bc4 = TREE.nodes.find((node) => node.san === 'Bc4');

    expect(extras[nf3?.id ?? '']).toMatchObject({ comment: 'The develop move' });
    expect(extras[bc4?.id ?? '']?.badges).toEqual(['key']);
    expect(extras[TREE.nodes[0]?.id ?? '']).toBeUndefined();
  });

  test('moves outside the focus are faded', () => {
    const focus = new Set(TREE.nodes.slice(0, 2).map((node) => node.id));
    const extras = explorerExtras(TREE, focus);

    expect(extras[TREE.nodes[0]?.id ?? '']).toBeUndefined();
    expect(extras[TREE.nodes[3]?.id ?? '']?.dimmed).toBe(true);
  });
});
