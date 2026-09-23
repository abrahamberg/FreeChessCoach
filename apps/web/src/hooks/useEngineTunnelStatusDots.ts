import { useEffect, useState } from 'react';
import { getLocalAiStatus, subscribeLocalAiStatus, type LocalAiStatus } from '../engine/local-ai-status.js';
import type { TunnelConnectionStatus } from '../engine/tunnel-connection-status.js';
import { useEngineStatus } from './useEngineStatus.js';
import { useLiteEngineStatus } from './useLiteEngineStatus.js';
import { useTunnelConnectionStatus } from './useTunnelConnectionStatus.js';

/** grey: this tab's tunnel is up but inactive (another tab of the user's gets the work). */
export type TunnelDotColor = 'green' | 'yellow' | 'red' | 'grey';

export interface EngineTunnelStatusDots {
  /** The tunnel's own health, shown for every engine mode: every mode can
   * fall back on the lite supplement over this tunnel, and a local AI setup
   * runs over it too (see useUnifiedTunnelActivation). */
  lite: TunnelDotColor;
  /** Only meaningful while the account's own engineMode is 'browser' — the
   * full-net worker this tracks is otherwise never asked to fulfill
   * anything, so the caller only renders this dot in that case. */
  browser: TunnelDotColor;
  /** Whether this tab reached the local AI server on its last call; the
   * caller only renders it for a local AI setup. */
  localAi: TunnelDotColor;
  /** Another of the user's tabs is the active one; the topbar says so. */
  inactive: boolean;
}

/** red: socket down. yellow: socket connecting, or up while this worker's
 * WASM is still loading. green: socket up and the worker ready. */
export function dotColor(connection: TunnelConnectionStatus, engineReady: boolean): TunnelDotColor {
  if (connection === 'inactive') return 'grey';
  if (connection === 'connecting') return 'yellow';
  if (connection !== 'connected') return 'red';
  return engineReady ? 'green' : 'yellow';
}

/** red when the socket is down or the local server did not answer; yellow
 * before the first call; green once a call went through. */
export function localAiDotColor(connection: TunnelConnectionStatus, localAi: LocalAiStatus): TunnelDotColor {
  if (connection === 'inactive') return 'grey';
  if (connection !== 'connected') return connection === 'connecting' ? 'yellow' : 'red';
  if (localAi === 'reachable') return 'green';
  return localAi === 'unreachable' ? 'red' : 'yellow';
}

function useLocalAiStatus(): LocalAiStatus {
  const [status, setStatus] = useState<LocalAiStatus>(getLocalAiStatus);
  useEffect(() => subscribeLocalAiStatus(setStatus), []);
  return status;
}

/** Derives the tunnel status dots next to the engine-mode pill in the
 * topbar. Everything runs over the one `/api/tunnel` WebSocket (see
 * useUnifiedTunnelClient), so the dots share its connection status and add
 * what each needs on top: its worker's install state, or the local server's
 * last answer. */
export function useEngineTunnelStatusDots(): EngineTunnelStatusDots {
  const connection = useTunnelConnectionStatus();
  const { status: liteStatus } = useLiteEngineStatus();
  const { status: mainStatus } = useEngineStatus();
  const localAi = useLocalAiStatus();

  return {
    lite: dotColor(connection, liteStatus === 'ready'),
    browser: dotColor(connection, mainStatus === 'ready'),
    localAi: localAiDotColor(connection, localAi),
    inactive: connection === 'inactive'
  };
}
