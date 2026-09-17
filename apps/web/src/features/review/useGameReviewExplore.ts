import { applySanSequence } from '@freechesscoach/chess-analysis';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalMoveInfo } from '../board/CoachBoard.js';
import { useExploreFeedback, type UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { useDivergedLine, type RealPosition, type UseDivergedLineResult } from '../session/useDivergedLine.js';

export interface UseGameReviewExploreResult {
  isExploring: boolean;
  open: () => void;
  close: () => void;
  divergedLine: UseDivergedLineResult;
  exploreFeedback: UseExploreFeedbackResult;
  handleLocalMove: (fen: string, move: LocalMoveInfo) => void;
  autoplayIntervalMs: number;
  setAutoplayIntervalMs: (ms: number) => void;
}

/**
 * Game Review's "explore on your own" sandbox — the same capability the
 * live Coach session already gives via SessionBoardColumn/useDivergedLine/
 * useExploreFeedback, minus everything there that exists only to coordinate
 * with the chat (useSessionBoardState's answer/peek `mode`, expect_move and
 * hypothetical_line tool calls). Game Review has no chat to coordinate with
 * — this only tracks whether the sandbox is open, the line the student has
 * built in it, and the engine's live feedback on it.
 */
export function useGameReviewExplore(currentRealPosition: RealPosition): UseGameReviewExploreResult {
  const [isExploring, setIsExploring] = useState(false);
  const [lastLocalMove, setLastLocalMove] = useState<LocalMoveInfo | null>(null);
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);
  const divergedLine = useDivergedLine();

  const close = useCallback(() => {
    setIsExploring(false);
    setLastLocalMove(null);
    divergedLine.exit();
  }, [divergedLine]);

  // Stepping the real game (MoveExplorer/MoveNavStrip) while a line is open
  // would otherwise leave the board showing a diverged line anchored to a
  // base ply that's no longer the one on screen — close the sandbox
  // whenever the real game's own position moves out from under it.
  const realPlyRef = useRef(currentRealPosition.ply);
  useEffect(() => {
    if (currentRealPosition.ply !== realPlyRef.current) {
      realPlyRef.current = currentRealPosition.ply;
      close();
    }
  }, [currentRealPosition.ply, close]);

  const open = useCallback(() => setIsExploring(true), []);

  const handleLocalMove = useCallback(
    (fen: string, move: LocalMoveInfo) => {
      setLastLocalMove(move);
      if (!isExploring) return;
      const applied = applySanSequence(move.fenBefore, [move.san]).moves[0];
      if (!applied) return;
      divergedLine.appendMove({ san: move.san, fen, uci: applied.uci }, currentRealPosition);
    },
    [isExploring, divergedLine, currentRealPosition]
  );

  const exploreFeedback = useExploreFeedback({
    enabled: isExploring,
    fen: divergedLine.fen ?? currentRealPosition.fen,
    lastMove: lastLocalMove
  });

  return { isExploring, open, close, divergedLine, exploreFeedback, handleLocalMove, autoplayIntervalMs, setAutoplayIntervalMs };
}
