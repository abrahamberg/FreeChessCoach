import type { CourseNode } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { courseFenBefore, moveLabel, sideToMove } from './moves.js';
import { parseCourseTree } from './tree.js';

describe('course moves', () => {
  const tree = parseCourseTree('1. d4 e5 2. dxe5 Nc6 *');
  const byId = new Map<string, CourseNode>(tree.nodes.map((node) => [node.id, node]));
  const [d4, e5] = tree.nodes;

  test('the position before a move: the start for the first, the parent’s after that', () => {
    expect(courseFenBefore(byId, tree.startFen, d4!)).toBe(tree.startFen);
    expect(courseFenBefore(byId, tree.startFen, e5!)).toBe(d4!.fenAfter);
    expect(sideToMove(d4!.fenAfter)).toBe('black');
  });

  test('"1.d4", "1…e5", and "1...e5" for a prompt', () => {
    expect(moveLabel(tree.startFen, 'd4')).toBe('1.d4');
    expect(moveLabel(d4!.fenAfter, 'e5')).toBe('1…e5');
    expect(moveLabel(d4!.fenAfter, 'e5', '...')).toBe('1...e5');
  });
});
