import { describe, expect, test } from 'vitest';
import { parseCourseTree } from './tree.js';

const NESTED = `[Event "Englund"]

1. d4 e5 2. dxe5 (2. e4 exd4) 2... Nc6 3. Nf3 (3. f4 d6 (3... f6)) 3... Qe7 *`;

describe('parseCourseTree', () => {
  test('lines run root to leaf and get default names Line A, B …', () => {
    const tree = parseCourseTree(NESTED);

    expect(tree.lines.map((line) => [line.id, line.name, line.leafNodeId])).toEqual([
      ['l1', 'Line A', 'n6'],
      ['l2', 'Line B', 'n8'],
      ['l3', 'Line C', 'n9'],
      ['l4', 'Line D', 'n11']
    ]);
    const lineOf = new Map(tree.nodes.map((node) => [node.san, node.lineId]));
    expect(lineOf.get('d4')).toBe('l1');
    expect(lineOf.get('f4')).toBe('l2');
    expect(lineOf.get('f6')).toBe('l3');
    expect(lineOf.get('e4')).toBe('l4');
  });

  test('a comment before the first move of a variation names its line', () => {
    const tree = parseCourseTree('{Main line} 1. e4 e5 ({The French} 1... e6 2. d4) 2. Nf3 *');

    expect(tree.lines.map((line) => line.name)).toEqual(['Main line', 'The French']);
    expect(tree.nodes.every((node) => node.comment === null)).toBe(true);
  });

  test('a repeated variation reuses the existing node', () => {
    const tree = parseCourseTree('1. e4 (1. d4) (1. d4 d5) *');

    expect(tree.nodes.map((node) => node.san)).toEqual(['e4', 'd4', 'd5']);
    expect(tree.lines).toHaveLength(2);
  });

  test('a branching section names its line and its # notes describe it', () => {
    const tree = parseCourseTree('Main idea:\n1. e4 e5 2. Nf3\n---\nThe Latvian:\n# a wild answer\n# it hangs a pawn\n1... f5');

    expect(tree.errors).toEqual([]);
    expect(tree.lines.map((line) => [line.name, line.note])).toEqual([
      ['Main idea', null],
      ['The Latvian', 'a wild answer it hangs a pawn']
    ]);
  });

  test('a section that continues a line comments its first new move instead', () => {
    const tree = parseCourseTree('1. e4 e5\n---\nThe plan:\n# develop\n2. Nf3 Nc6');
    const nf3 = tree.nodes.find((node) => node.san === 'Nf3');

    expect(tree.lines).toHaveLength(1);
    expect(nf3?.comment).toBe('The plan — develop');
  });

  test('a variation comment still names its line next to a section name', () => {
    const tree = parseCourseTree('1. e4 e5 ({The Sicilian} 1... c5)\n---\nFrench:\n1... e6');

    expect(tree.lines.map((line) => line.name)).toEqual(['Line A', 'The Sicilian', 'French']);
  });
});
