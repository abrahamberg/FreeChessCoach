import { useEffect, useState } from 'react';
import type { EngineMode } from '@freechesscoach/shared';

export interface ActiveAnalysis {
  analysisId: string;
  gameId: string;
  status: string;
  analyzedPositions: number;
  totalPositions: number;
}

export interface ActiveAnalysesResult {
  /** 'native' or 'chess_api' (both server-side — "cloud") or 'browser' (this
   * user's own tab, tunneled — "your device"). Null until the first frame
   * arrives. */
  engineMode: EngineMode | null;
  analyses: ActiveAnalysis[];
}

/** Consumes GET /api/analyses/active (SSE) — the global engine-activity
 * indicator's server-side signal. Unlike useAnalysisStatus, this needs no
 * analysisId: it's meant to be mounted once, high in the tree, and watch for
 * *any* background analysis belonging to the current user for the rest of
 * the session, on whatever page the user happens to navigate to. The
 * connection is reopened by the browser's own EventSource reconnect on a
 * drop, and re-established fresh on a full page reload — that's what makes
 * this durable across both, not just across route changes. */
export function useActiveAnalyses(): ActiveAnalysesResult {
  const [result, setResult] = useState<ActiveAnalysesResult>({ engineMode: null, analyses: [] });

  useEffect(() => {
    // Mounted unconditionally at the app root (AppShell), unlike
    // useAnalysisStatus's per-page, opt-in SSE connection — so a test
    // environment lacking EventSource (jsdom has no native implementation)
    // shouldn't crash every test that merely renders the shell. A real
    // browser always has this.
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource('/api/analyses/active');
    source.onmessage = (event) => {
      setResult(JSON.parse(event.data) as ActiveAnalysesResult);
    };
    return () => source.close();
  }, []);

  return result;
}
