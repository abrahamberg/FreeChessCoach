import { describe, expect, test } from 'vitest';
import { gameTree } from '../board/move-tree-state.js';
import { addMove, type EditableTree } from '@freechesscoach/chess-analysis';
import { branchStepNode } from './branch-step-sound.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 1. e4 e5 2. Nf3 Nc6, with 2. Bc4 Nf6 as an alternative to 2. Nf3. */
function sample(): { tree: EditableTree; main: string[]; bc4: string; nf6: string } {
  const base = gameTree(START, ['e4', 'e5', 'Nf3', 'Nc6'], '');
  const main = base.nodes.map((node) => node.id);
  const first = addMove(base, main[1] ?? null, 'Bc4');
  if (!first.ok) throw new Error(first.error);
  const second = addMove(first.tree, first.nodeId, 'Nf6');
  if (!second.ok) throw new Error(second.error);
  return { tree: second.tree, main, bc4: first.nodeId, nf6: second.nodeId };
}

describe('branchStepNode', () => {
  test('sounds a variation move, whether stepped to or jumped to', () => {
    const { tree, main, bc4, nf6 } = sample();
    expect(branchStepNode(tree, main[1] ?? null, bc4)?.san).toBe('Bc4');
    expect(branchStepNode(tree, bc4, nf6)?.san).toBe('Nf6');
    expect(branchStepNode(tree, main[3] ?? null, nf6)?.san).toBe('Nf6');
  });

  test('stepping back sounds nothing', () => {
    const { tree, main, bc4, nf6 } = sample();
    expect(branchStepNode(tree, nf6, bc4)).toBeNull();
    expect(branchStepNode(tree, bc4, main[1] ?? null)).toBeNull();
  });

  test('the main-line move picked after leaving a variation sounds, unless the ply step already does', () => {
    const { tree, main, nf6 } = sample();
    expect(branchStepNode(tree, nf6, main[3] ?? null)?.san).toBe('Nc6');
    expect(branchStepNode(tree, nf6, main[2] ?? null)).toBeNull();
  });

  test('main-line steps are left to the ply hook', () => {
    const { tree, main } = sample();
    expect(branchStepNode(tree, main[0] ?? null, main[1] ?? null)).toBeNull();
    expect(branchStepNode(tree, null, main[0] ?? null)).toBeNull();
  });
});
