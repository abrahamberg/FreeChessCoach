import { useEffect } from 'react';
import { getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import { useEngineTunnelClient } from './useEngineTunnelClient.js';

/** Keeps the browser engine tunnel connected for every user, regardless of
 * their configured engineMode — the lite engine is a compulsory supplement
 * any engine setting can fall back on when its own result comes back short
 * (see LiteSupplementedEngineBackend), not a Browser-mode-only feature, so
 * gating this on engineMode === 'browser' (the old behavior) left the lite
 * supplement permanently unreachable for 'native'/'chess_api' users — see
 * bot-move-selector.ts's dev log, whose `lightBrowser.error` field is what
 * actually surfaced this.
 *
 * Mounted once at the app root (App.tsx) so background jobs and bot-move
 * supplementation can reach the tab even outside an active session.
 *
 * Also preloads the lite engine's ~7MB WASM build immediately, rather than
 * waiting for the first tunnel request to need it (SharedEngineWorker's
 * normal lazy-create-on-first-analyze design, useWasmEngine.test.ts): a bot
 * move is a live, user-waiting request, so downloading the lite build only
 * once one is already in flight means the very first bot move of a session
 * eats that download as latency instead of it having already happened in
 * the background. The heavy full-net build (used only for actual Browser
 * mode, ~108MB) is deliberately NOT preloaded here — that stays opt-in via
 * EngineModeSelect's own preload, since not every user has chosen to pay
 * for that download. */
export function useEngineTunnelActivation(): void {
  useEngineTunnelClient({ enabled: true });
  useEffect(() => {
    getSharedLiteEngineWorker().preload();
  }, []);
}
