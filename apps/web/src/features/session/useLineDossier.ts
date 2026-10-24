import { LINE_DOSSIER_MAX_MOVES, LineDossierResponseSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client.js';
import type { DivergedLineState } from './diverged-line-tree.js';

/** How long the line must stand still before its dossier is asked for. */
const SETTLE_MS = 1200;

/** The query for the coach's dossier on a line the student explores. Frozen
 * by the line itself: the same moves are asked for once. */
export function lineDossierQuery(line: DivergedLineState, studentColor: 'white' | 'black') {
  const moves = line.moves.slice(0, LINE_DOSSIER_MAX_MOVES).map((move) => move.san);
  return {
    queryKey: ['line-dossier', line.baseFen, line.basePly, moves.join(' '), studentColor],
    queryFn: async (): Promise<string> =>
      (await apiPost('/api/positions/line-dossier', { startFen: line.baseFen, basePly: line.basePly, moves, studentColor }, LineDossierResponseSchema)).text,
    staleTime: Infinity
  };
}

/** Asks for the dossier in the background once the line has stood still, so
 * it is ready when the student sends a message (handleSendMessage fetches it
 * through the same query if it is not). */
export function usePrefetchLineDossier(line: DivergedLineState | null, studentColor: 'white' | 'black'): void {
  const key = line ? JSON.stringify(lineDossierQuery(line, studentColor).queryKey) : null;
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(key), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [key]);
  useQuery({ ...lineDossierQuery(line ?? EMPTY_LINE, studentColor), enabled: line !== null && settled === key });
}

const EMPTY_LINE: DivergedLineState = { basePly: 0, baseFen: '', moves: [] };
