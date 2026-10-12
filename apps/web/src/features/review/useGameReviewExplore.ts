import { useCallback, useEffect, useState } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { PgnTreeNode } from '@freechesscoach/chess-analysis';
import type { LocalMoveInfo } from '../board/CoachBoard.js';
import { useExploreFeedback, type ExploreLastMove, type UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import type { UseMoveTreeResult } from '../board/useMoveTree.js';

export interface UseGameReviewExploreResult {
  /** The board takes moves: each one becomes a variation in the move list. */
  isExploring: boolean;
  open: () => void;
  /** Stops taking moves and returns the board to the game; the variations stay. */
  close: () => void;
  /** Stops taking moves where the board is (the student stepped the move list). */
  stop: () => void;
  exploreFeedback: UseExploreFeedbackResult;
  /** The engine's verdict on each variation move the student has had on the
   * board, by node id: the move list shows them as it does the game's own. */
  scored: Record<string, ClassifiedMoveDto>;
  handleLocalMove: (fen: string, move: LocalMoveInfo) => void;
}

/**
 * Game Review's "explore on your own" — the same capability the live Coach
 * session gives via SessionBoardColumn/useDivergedLine/useExploreFeedback,
 * minus everything there that exists only to coordinate with the chat. A
 * move dropped on the board is played into the page's move tree
 * (useMoveTree), where it stays as a variation; the engine's live feedback
 * follows whichever variation move is on the board.
 */
export function useGameReviewExplore(moveTree: UseMoveTreeResult, currentNode: PgnTreeNode | null, inVariation: boolean, fen: string): UseGameReviewExploreResult {
  const [isExploring, setIsExploring] = useState(false);

  const open = useCallback(() => setIsExploring(true), []);
  const stop = useCallback(() => setIsExploring(false), []);
  const { back } = moveTree;
  const close = useCallback(() => {
    setIsExploring(false);
    back();
  }, [back]);

  const { play } = moveTree;
  const handleLocalMove = useCallback(
    (_fen: string, move: LocalMoveInfo) => {
      if (isExploring) play(move.san);
    },
    [isExploring, play]
  );

  const exploreFeedback = useExploreFeedback({
    enabled: isExploring || inVariation,
    fen,
    lastMove: inVariation && currentNode ? lastMoveOf(moveTree, currentNode) : null
  });

  const [scored, setScored] = useState<Record<string, ClassifiedMoveDto>>({});
  const { note } = exploreFeedback;
  const nodeId = inVariation && currentNode ? currentNode.id : null;
  const nodeUci = currentNode?.uci;
  useEffect(() => {
    // The note follows the board a moment late; only keep one that is this node's move.
    if (nodeId && note && note.uci === nodeUci) setScored((all) => (all[nodeId] === note ? all : { ...all, [nodeId]: note }));
  }, [nodeId, nodeUci, note]);

  return { isExploring, open, close, stop, exploreFeedback, scored, handleLocalMove };
}

function lastMoveOf(moveTree: UseMoveTreeResult, node: PgnTreeNode): ExploreLastMove {
  const parent = node.parentId === null ? null : moveTree.tree.nodes.find((each) => each.id === node.parentId);
  const fenBefore = parent?.fenAfter ?? moveTree.tree.startFen;
  return { fenBefore, san: node.san, mover: fenBefore.split(' ')[1] === 'b' ? 'black' : 'white' };
}
