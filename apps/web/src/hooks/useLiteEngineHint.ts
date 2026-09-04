import { useEffect, useRef, useState } from 'react';
import { cpToWords, mateToWords } from '../engine/eval-words.js';
import { getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import { useLiteEngineStatus } from './useLiteEngineStatus.js';

/** Matches bot-candidates.ts's BOT_SEARCH_DEPTH (apps/api) — kept as its own
 * constant since apps/web can't import a server-only module, not because
 * the two are meant to drift independently. */
const JIT_HINT_DEPTH = 18;
/** Within the spec's recommended 20-40 range for lite-engine multiPv. */
const JIT_HINT_MULTI_PV = 20;

export type LiteEngineHintStatus = 'not-loaded' | 'loading' | 'analyzing' | 'ready';

export interface UseLiteEngineHintOptions {
  /** Off by default (see BotStatusPanel's own gating) — this is exploratory
   * hint UI, not the coach's official verdict, so it only ever runs when a
   * caller actively wants it shown. */
  enabled: boolean;
  fen: string | null;
}

export interface UseLiteEngineHintResult {
  status: LiteEngineHintStatus;
  /** Word-based, exploratory only — never the coach's official move-quality
   * verdict (that stays main-engine-graded, see LiteSupplementedEngineBackend's
   * own doc comment on the server side). */
  evaluation: string | null;
}

/**
 * Just-in-time, in-browser hint readout for a live bot game — the lite
 * worker analyzing whatever position is currently on screen, labeled
 * exploratory. Runs entirely client-side (no tunnel round trip: the
 * lightweight worker already lives in this same tab, unlike server-side
 * bot move selection, which reaches it over the tunnel — see
 * shared-engine-worker-instance.ts's getSharedLiteEngineWorker).
 */
export function useLiteEngineHint({ enabled, fen }: UseLiteEngineHintOptions): UseLiteEngineHintResult {
  const { status: installStatus } = useLiteEngineStatus({ preload: enabled });
  const [evaluation, setEvaluation] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !fen || installStatus !== 'ready') return;

    const requestId = ++requestIdRef.current;
    const sideToMove = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    setAnalyzing(true);

    void getSharedLiteEngineWorker()
      .analyze({ fen, depth: JIT_HINT_DEPTH, multiPv: JIT_HINT_MULTI_PV })
      .then((lines) => {
        if (requestIdRef.current !== requestId) return; // superseded by a newer position
        const best = lines[0];
        if (!best) return;
        setEvaluation(best.mateIn !== null ? mateToWords(best.mateIn, sideToMove) : cpToWords(best.cp ?? 0, sideToMove));
      })
      .catch(() => undefined)
      .finally(() => {
        if (requestIdRef.current === requestId) setAnalyzing(false);
      });
  }, [enabled, fen, installStatus]);

  if (!enabled) return { status: 'not-loaded', evaluation: null };
  if (installStatus !== 'ready') return { status: installStatus === 'installing' ? 'loading' : 'not-loaded', evaluation };
  return { status: analyzing ? 'analyzing' : 'ready', evaluation };
}
