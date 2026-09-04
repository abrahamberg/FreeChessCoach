export type TunnelConnectionStatus = 'connected' | 'disconnected';

/** Module-level (not React state) because the socket lives in
 * useEngineTunnelClient, mounted once at the app root (App.tsx), while the
 * status dots render in AppShell's topbar — a sibling branch, not a
 * descendant, of where the hook runs. A subscribe/notify singleton (same
 * shape as SharedEngineWorker's own status listeners) lets both sides agree
 * on the connection state without threading it through props or a context
 * provider just for this. */
let status: TunnelConnectionStatus = 'disconnected';
const listeners = new Set<(status: TunnelConnectionStatus) => void>();

export function getTunnelConnectionStatus(): TunnelConnectionStatus {
  return status;
}

export function setTunnelConnectionStatus(next: TunnelConnectionStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener(next);
}

/** Notifies on every status change and immediately with the current value.
 * Returns an unsubscribe. */
export function subscribeTunnelConnectionStatus(listener: (status: TunnelConnectionStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function resetTunnelConnectionStatusForTests(): void {
  status = 'disconnected';
  listeners.clear();
}
