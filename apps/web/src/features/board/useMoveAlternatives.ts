import { toCpWhite, winPctFor } from '@freechesscoach/chess-analysis';
import { HintMovesResponseSchema } from '@freechesscoach/shared';
import { useEffect, useRef, useState } from 'react';
import { apiPost } from '../../api/client.js';

export interface FetchedAlternative {
  san: string;
  winPct: number;
}

interface MoveAlternativesResult {
  data: FetchedAlternative[];
  isLoading: boolean;
}

/**
 * The deep, per-game analysis pipeline runs single-PV only (algorith.md
 * §1.3 — the batch engine doesn't report alternatives), so
 * `ClassifiedMoveDto.alternatives` is often empty. This lazily fills that
 * gap from the same shallow, uncached "lite" engine endpoint the bot
 * session's hint feature already uses (POST /api/positions/hint-moves) —
 * fetched only for the one move currently being looked at (`enabled`),
 * never eagerly for the whole game. Plain fetch+state rather than React
 * Query: this hook is used from a shared board component that renders in
 * places without a QueryClientProvider in scope (e.g. component tests).
 */
export function useMoveAlternatives(
  fenBefore: string | undefined,
  mover: 'white' | 'black' | undefined,
  bestMoveSan: string | undefined,
  enabled: boolean
): MoveAlternativesResult {
  const [data, setData] = useState<FetchedAlternative[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!enabled || !fenBefore) {
      setData([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void apiPost('/api/positions/hint-moves', { fen: fenBefore }, HintMovesResponseSchema)
      .then(({ lines }) => {
        if (requestRef.current !== requestId) return;
        setData(
          lines
            .filter((line) => line.moveSan !== bestMoveSan)
            .slice(0, 2)
            .map((line) => ({
              san: line.moveSan,
              winPct: winPctFor(mover ?? 'white', toCpWhite({ cp: line.cp, mateIn: line.mateIn }))
            }))
        );
      })
      .catch(() => {
        if (requestRef.current === requestId) setData([]);
      })
      .finally(() => {
        if (requestRef.current === requestId) setIsLoading(false);
      });
  }, [enabled, fenBefore, mover, bestMoveSan]);

  return { data, isLoading };
}
