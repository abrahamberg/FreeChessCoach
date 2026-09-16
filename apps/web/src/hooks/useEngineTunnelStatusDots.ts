import { useEngineStatus } from './useEngineStatus.js';
import { useLiteEngineStatus } from './useLiteEngineStatus.js';
import { useTunnelConnectionStatus } from './useTunnelConnectionStatus.js';

export type TunnelDotColor = 'green' | 'yellow' | 'red';

export interface EngineTunnelStatusDots {
  /** Always relevant — every engineMode can fall back on the lite tunnel
   * supplement (LiteSupplementedEngineBackend), so this dot is never hidden;
   * see useEngineTunnelActivation, which keeps the tunnel connected and the
   * lite worker preloading for every account regardless of engineMode. */
  lite: TunnelDotColor;
  /** Only meaningful while the account's own engineMode is 'browser' — the
   * full-net worker this tracks is otherwise never asked to fulfill
   * anything, so the caller should only render this dot in that case (see
   * TunnelStatusDots.tsx). */
  browser: TunnelDotColor;
}

function dotColor(connected: boolean, engineReady: boolean): TunnelDotColor {
  if (!connected) return 'red';
  return engineReady ? 'green' : 'yellow';
}

/** Derives the two tunnel status dots shown next to the engine-mode pill in
 * AppShell's topbar. Both the lite supplement and (in Browser mode) the
 * account's main engine are fulfilled over the same single
 * `/api/engine-tunnel` WebSocket (see useEngineTunnelClient) — so both dots
 * share one connection status but track their own worker's install state
 * independently: red when the socket itself isn't up, yellow once it's up
 * but that specific worker's WASM hasn't finished loading yet, green once
 * both are true. */
export function useEngineTunnelStatusDots(): EngineTunnelStatusDots {
  const connectionStatus = useTunnelConnectionStatus();
  const { status: liteStatus } = useLiteEngineStatus();
  const { status: mainStatus } = useEngineStatus();
  const connected = connectionStatus === 'connected';

  return {
    lite: dotColor(connected, liteStatus === 'ready'),
    browser: dotColor(connected, mainStatus === 'ready')
  };
}
