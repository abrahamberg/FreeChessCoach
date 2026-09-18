import { useEffect, useRef, useState } from 'react';
import { HintMovesResponseSchema } from '@freechesscoach/shared';
import { apiPost } from '../../api/client.js';
import type { BoardArrow, BoardHighlight } from './CoachBoard.js';
import { candidateMoveColor, candidateMoveHighlightColor } from './candidateMoveColors.js';

export interface HintTopMove {
  san: string;
  from: string;
  to: string;
}

export interface UseHintMovesResult {
  /** Two-stage reveal, both drawn on the board itself (design ask: no
   * explanatory text) — 1st click highlights the pieces the engine's top 3
   * moves would move (WHICH piece); 2nd click reveals the same moves' arrows
   * (WHERE it goes); a 3rd click, or the position changing, resets it. */
  stage: 0 | 1 | 2;
  topMoves: HintTopMove[];
  isLoading: boolean;
  error: boolean;
  highlights: BoardHighlight[];
  arrows: BoardArrow[];
  handleClick: () => void;
}

/**
 * The Hint button's engine round trip + two-stage reveal state, shared by
 * every board that offers it (Play vs Bot originally, now also "play with
 * coach" and puzzle practice — see BoardActionBar). Resets itself whenever
 * `fen` changes (a move was made/the position moved on) so a stale hint
 * never lingers on a position it no longer describes.
 */
export function useHintMoves(fen: string): UseHintMovesResult {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [topMoves, setTopMoves] = useState<HintTopMove[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  // Guards against a slow/late engine response landing after the student has
  // already moved on (a new position, or clicked Hint again) — the request
  // that's still current is the only one allowed to update state.
  const requestRef = useRef(0);

  useEffect(() => {
    setStage(0);
    setTopMoves([]);
    setError(false);
    requestRef.current += 1;
  }, [fen]);

  function fetchHintMoves(): void {
    setError(false);
    setIsLoading(true);
    const requestId = ++requestRef.current;
    void apiPost('/api/positions/hint-moves', { fen }, HintMovesResponseSchema)
      .then(({ lines }) => {
        if (requestRef.current !== requestId) return;
        setTopMoves(lines.map((line) => ({ san: line.moveSan, from: line.moveUci.slice(0, 2), to: line.moveUci.slice(2, 4) })));
        setIsLoading(false);
      })
      // A server-side search failure (engine unreachable, etc.) — without
      // this a request could hang forever with no way out.
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setIsLoading(false);
        setError(true);
      });
  }

  function handleClick(): void {
    if (stage === 0) {
      setStage(1);
      fetchHintMoves();
      return;
    }
    if (stage === 1) {
      setStage(2);
      return;
    }
    setStage(0);
    setTopMoves([]);
    setError(false);
  }

  const highlights: BoardHighlight[] =
    stage >= 1 ? topMoves.map((move, index) => ({ square: move.from, color: candidateMoveHighlightColor(index) })) : [];
  const arrows: BoardArrow[] =
    stage === 2 ? topMoves.map((move, index) => ({ from: move.from, to: move.to, color: candidateMoveColor(index) })) : [];

  return { stage, topMoves, isLoading, error, highlights, arrows, handleClick };
}
