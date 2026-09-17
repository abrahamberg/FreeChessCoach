import { useEffect, useState } from 'react';

export interface AnalysisStatusEvent {
  status: string;
  /** Positions the engine has finished so far. Optional so a frame from an api
   * that predates progress reporting still parses. */
  analyzedPositions?: number;
  /** Set only when status is 'failed' — already scrubbed server-side
   * (services/analysis.ts's describeError) to a message safe to show as-is. */
  error?: string | null;
}

export interface AnalysisStatusResult {
  status: string | null;
  analyzedPositions: number;
  error: string | null;
}

/** Consumes GET /api/analyses/:id/status (SSE). Returns null until the first
 * status frame arrives; reconnects whenever `analysisId` changes. */
export function useAnalysisStatus(analysisId: string | null): AnalysisStatusResult {
  const [status, setStatus] = useState<string | null>(null);
  const [analyzedPositions, setAnalyzedPositions] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!analysisId) return;

    setStatus(null);
    setAnalyzedPositions(0);
    setError(null);
    const source = new EventSource(`/api/analyses/${analysisId}/status`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as AnalysisStatusEvent;
      setStatus(data.status);
      if (typeof data.analyzedPositions === 'number') setAnalyzedPositions(data.analyzedPositions);
      setError(data.error ?? null);
    };

    return () => source.close();
  }, [analysisId]);

  return { status, analyzedPositions, error };
}
