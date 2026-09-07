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
  /** True when the fetch itself failed (network error, non-2xx, bad
   * response shape) — kept distinct from an empty `data`, which just means
   * the engine found nothing better; conflating the two would show a
   * backend failure identically to "no alternatives here". */
  isError: boolean;
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
  const [isError, setIsError] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const isStale = () => requestRef.current !== requestId;
    // Cleared unconditionally (not just on the disabled branch below) so
    // switching directly from one move needing a fetch to another never
    // leaves the first move's now-irrelevant runners-up on screen while the
    // second's request is still in flight.
    setData([]);
    setIsError(false);

    if (!enabled || !fenBefore) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void apiPost('/api/positions/hint-moves', { fen: fenBefore }, HintMovesResponseSchema)
      .then(({ lines }) => {
        if (isStale()) return;
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
        if (!isStale()) setIsError(true);
      })
      .finally(() => {
        if (!isStale()) setIsLoading(false);
      });
  }, [enabled, fenBefore, mover, bestMoveSan]);

  return { data, isLoading, isError };
}
