import { UserProfileSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { getSharedEngineWorker, getSharedLiteEngineWorker } from '../engine/shared-engine-worker-instance.js';
import { markTabUsed } from '../engine/tunnel-tab-usage.js';
import { useUnifiedTunnelClient } from './useUnifiedTunnelClient.js';

/** Keeps the tunnel connected for every signed-in user, regardless of
 * engineMode or AI setup. The lite engine is a compulsory supplement any
 * engine setting can fall back on (LiteSupplementedEngineBackend), so gating
 * the tunnel on engineMode === 'browser' leaves it unreachable for
 * 'native'/'chess_api' users — which is what turned the lite status dot
 * permanently not-green in Internal mode. Mounted once at the app root
 * (App.tsx), not in the demo.
 *
 * Also preloads the lite engine's ~7MB WASM build straight away, so the
 * first bot move of a session doesn't pay for that download. The ~108MB
 * full-net build is preloaded only when engineMode is 'browser' — that
 * setting is the opt-in for the download; other modes never pay for it. */
export function useUnifiedTunnelActivation(): void {
  useUnifiedTunnelClient(true);
  useTabUsageTracking();
  useLiteEnginePreload();
  useMainEnginePreload();
}

/** Marks this tab used when the user navigates in it, switches to it, clicks
 * or types (engine/tunnel-tab-usage.ts). Only refreshes anything while this
 * tab already holds the tunnel (markTabUsed's own gate) — moving to the
 * background, or another tab briefly getting focus, must not hand the
 * tunnel over by itself; only an explicit takeover (TunnelTakeoverGate) or
 * the active tab closing does that. */
function useTabUsageTracking(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    markTabUsed();
  }, [pathname]);

  useEffect(() => {
    const onInput = (): void => markTabUsed(true);
    const onSwitchedTo = (): void => markTabUsed();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') markTabUsed();
    };
    window.addEventListener('pointerdown', onInput, { capture: true, passive: true });
    window.addEventListener('keydown', onInput, { capture: true, passive: true });
    window.addEventListener('focus', onSwitchedTo);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', onInput, { capture: true });
      window.removeEventListener('keydown', onInput, { capture: true });
      window.removeEventListener('focus', onSwitchedTo);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
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
