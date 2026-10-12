import { useCallback, useState } from 'react';
import type { EditableTree } from '@freechesscoach/chess-analysis';
import { back, initialMoveTree, play, remove, select, type MoveTreeState } from './move-tree-state.js';

const EMPTY_TREE: EditableTree = { startFen: '', nodes: [], errors: [] };

export interface UseMoveTreeResult {
  tree: EditableTree;
  currentId: string | null;
  select: (nodeId: string | null) => void;
  /** Plays a move from the current node (the board only offers legal ones). */
  play: (san: string) => void;
  back: () => void;
  remove: (nodeId: string) => void;
}

/** A move tree that keeps what the student adds until the page is left.
 * `base` is the game's own tree (null while it loads); a different one
 * starts over. */
export function useMoveTree(base: EditableTree | null): UseMoveTreeResult {
  const [held, setHeld] = useState<{ base: EditableTree | null; state: MoveTreeState }>(() => ({ base, state: initialMoveTree(base ?? EMPTY_TREE) }));
  let state = held.state;
  if (held.base !== base) {
    state = initialMoveTree(base ?? EMPTY_TREE);
    setHeld({ base, state });
  }

  const update = useCallback((change: (current: MoveTreeState) => MoveTreeState | null): void => {
    setHeld((current) => {
      const next = change(current.state);
      return next ? { ...current, state: next } : current;
    });
  }, []);

  return {
    tree: state.tree,
    currentId: state.currentId,
    select: useCallback((nodeId) => update((current) => select(current, nodeId)), [update]),
    play: useCallback((san) => update((current) => play(current, san)), [update]),
    back: useCallback(() => update((current) => back(current)), [update]),
    remove: useCallback((nodeId) => update((current) => remove(current, nodeId)), [update])
  };
}
