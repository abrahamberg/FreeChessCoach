import { pathTo, type EditableTree } from '@freechesscoach/chess-analysis';
import { useEffect, useRef } from 'react';
import { playBoardSound } from '../../sounds/board-sounds.js';
import { moveSound } from '../../sounds/move-sounds.js';
import { branchStepNode } from './branch-step-sound.js';

/** Board sounds for the moves useMoveStepSounds can't see: those on a
 * variation, and the main-line move picked after leaving one. They carry no
 * quality, so they never play bad or great. */
export function useBranchStepSounds(tree: EditableTree, currentId: string | null, learnerSide: 'white' | 'black'): void {
  const previous = useRef(currentId);
  useEffect(() => {
    const from = previous.current;
    previous.current = currentId;
    const node = branchStepNode(tree, from, currentId);
    if (!node) return;
    const ply = pathTo(tree, node.id).length;
    playBoardSound(moveSound({ san: node.san, mover: ply % 2 === 1 ? 'white' : 'black', learnerSide }));
  }, [currentId]);
}
