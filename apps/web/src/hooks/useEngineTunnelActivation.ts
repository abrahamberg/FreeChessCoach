import { UserProfileSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiGet } from '../api/client.js';
import { getSharedEngineWorker, getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
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
 * normal lazy-create-on-first-analyze design, shared-engine-worker.test.ts): a bot
 * move is a live, user-waiting request, so downloading the lite build only
 * once one is already in flight means the very first bot move of a session
 * eats that download as latency instead of it having already happened in
 * the background.
 *
 * The heavy full-net build (~108MB) is preloaded too, but only when the
 * account's engineMode actually says 'browser' — that setting IS the opt-in
 * for the download, and that worker is what fulfills every main request
 * while it's selected. It used to be initialized only by EngineModeSelect's
 * own preload, so on a fresh session the worker sat unstarted until the
 * user visited Settings once (or until the first tunnel request paid for
 * the WASM handshake and, on a timeout, silently fell back to the native
 * engine) — engine mode only "started working" after a trip to Settings.
 * Other engine modes still never pay for that download. */
export function useEngineTunnelActivation(): void {
  useEngineTunnelClient({ enabled: true });
  useLiteEnginePreload();
  useMainEnginePreload();
}

function useLiteEnginePreload(): void {
  useEffect(() => {
    getSharedLiteEngineWorker().preload();
  }, []);
}

/** Same ['profile'] query UserMenu/SettingsPage use, so this costs no extra
 * request once either has run — and a settings change to engineMode lands
 * in this cache immediately (SettingsPage's setQueryData), starting the
 * preload without waiting for a reload. */
function useMainEnginePreload(): void {
  const engineMode = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  }).data?.engineMode;

  useEffect(() => {
    if (engineMode !== 'browser') return;
    getSharedEngineWorker().preload();
  }, [engineMode]);
}
