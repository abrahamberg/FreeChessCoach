import { useCallback, useState } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { PgnTreeNode } from '@freechesscoach/chess-analysis';
import type { LocalMoveInfo } from '../board/CoachBoard.js';
import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import type { UseMoveTreeResult } from '../board/useMoveTree.js';
import { exploreFeedbackOf } from '../live-review/explore-feedback.js';
import { isLearnerMove, latestNodeId } from '../live-review/review-order.js';
import { useLiveReview } from '../live-review/useLiveReview.js';

export interface UseGameReviewExploreResult {
  /** The learner's own line is on the board: a move dropped on it joins the move tree. */
  isExploring: boolean;
  /** Back to the game; the variations stay in the move list. */
  close: () => void;
  /** Stops taking moves where the board is (the learner stepped the move list). */
  stop: () => void;
  exploreFeedback: UseExploreFeedbackResult;
  /** The engine's verdict on each variation move the learner has had on the
   * board, by node id: the move list shows them as it does the game's own. */
  scored: Record<string, ClassifiedMoveDto>;
  handleLocalMove: (fen: string, move: LocalMoveInfo) => void;
}

/**
 * Game Review's "explore on your own": no button, the board always takes a
 * move. A move dropped on it is played into the page's move tree (useMoveTree),
 * where it stays as a variation, and the live review (useLiveReview: the
 * engine's verdict on every move of the line, best moves as arrows) follows
 * the board. The game's own moves keep their stored analysis and are not
 * looked at again.
 */
export function useGameReviewExplore(moveTree: UseMoveTreeResult, _currentNode: PgnTreeNode | null, inVariation: boolean): UseGameReviewExploreResult {
  const [isExploring, setIsExploring] = useState(false);

  const stop = useCallback(() => setIsExploring(false), []);
  const { back } = moveTree;
  const close = useCallback(() => {
    setIsExploring(false);
    back();
  }, [back]);

  const { play } = moveTree;
  const handleLocalMove = useCallback(
    (_fen: string, move: LocalMoveInfo) => {
      setIsExploring(true);
      play(move.san);
    },
    [play]
  );

  // Every line off the game gets its icons, whichever is on the board; the
  // verdict and arrows follow the board only while the learner's line is on it.
  const hasLines = moveTree.tree.nodes.some((node) => isLearnerMove(node.id));
  const onBoard = isExploring || inVariation;
  const review = useLiveReview(moveTree.tree, onBoard ? moveTree.currentId : null, latestNodeId(moveTree.tree), hasLines, isLearnerMove);
  return { isExploring, close, stop, exploreFeedback: exploreFeedbackOf(review, onBoard), scored: review.scored, handleLocalMove };
}
