import { useEffect, useState } from 'react';
import {
  getTunnelConnectionStatus,
  subscribeTunnelConnectionStatus,
  type TunnelConnectionStatus
} from '../engine/tunnel-connection-status.js';

/** Tracks the single `/api/engine-tunnel` WebSocket's own open/closed state
 * (see useEngineTunnelClient, which is what actually owns the socket and
 * reports into this module-level store). Distinct from useEngineStatus /
 * useLiteEngineStatus, which track whether a given worker's WASM has
 * finished loading — the socket can be open with neither worker downloaded
 * yet, which is exactly the "yellow" state the topbar's status dots need to
 * tell apart from "genuinely not connected." */
export function useTunnelConnectionStatus(): TunnelConnectionStatus {
  const [status, setStatus] = useState<TunnelConnectionStatus>(getTunnelConnectionStatus);
  useEffect(() => subscribeTunnelConnectionStatus(setStatus), []);
  return status;
}
