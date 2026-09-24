import { useQuery } from '@tanstack/react-query';
import { PositionAnalysisSchema } from '@freechesscoach/shared';
import { apiPost } from '../../api/client.js';

/** Fetches engine analysis for a single position (the inspector's data
 * source, POST /api/positions/analyze) — a live call through the standard
 * pipeline (Lichess eval index first, then the user's selected engine).
 * TanStack Query caches the result client-side by `fen`, so re-opening the
 * same position in this session is instant; there's no server-side cache. */
export function usePositionAnalysis(fen: string | null) {
  return useQuery({
    queryKey: ['position-analysis', fen],
    queryFn: () => apiPost('/api/positions/analyze', { fen }, PositionAnalysisSchema),
    enabled: fen !== null
  });
}
