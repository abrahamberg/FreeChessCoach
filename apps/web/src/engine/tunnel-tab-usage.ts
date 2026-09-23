import { getTunnelConnectionStatus } from './tunnel-connection-status.js';

/** When the user last used this tab: loaded a page (including in-app
 * navigation), switched to it, clicked or typed. With several tabs open, the
 * server sends new tunnel requests to the most recently used one — a tab
 * left in the background can be throttled or frozen by the browser and
 * never answer.
 *
 * Starts at 0 (never used): a brand-new tab must never out-rank the tab that
 * currently holds the tunnel just by loading, even in the foreground —
 * ownership only moves to another tab through an explicit takeover
 * (claimTunnelActive, e.g. the "Take over" button on the takeover screen,
 * see TunnelTakeoverGate) or because the active tab closed and this is the
 * next one in line. */
let lastUsedAt = 0;
const listeners = new Set<(at: number) => void>();

/** Repeated clicks and keys within this window report once. */
const REPORT_THROTTLE_MS = 2_000;
let lastReportedAt = 0;

export function getTabLastUsedAt(): number {
  return lastUsedAt;
}

/** `throttled` is for clicks and keys, which come in bursts. Switching to
 * the tab or loading a page always reports, so it can win over another tab
 * used a moment before.
 *
 * Only refreshes anything while this tab is confirmed the active one
 * (`getTunnelConnectionStatus() === 'connected'`): a tab that is still
 * connecting, or that lost the tunnel to another tab, must not silently
 * reclaim it just because its user clicked or navigated — that requires
 * going through claimTunnelActive(). Once a tab IS active, this keeps its
 * recency fresh so it stays the target across a reconnect (idle timeout,
 * deploy) even while backgrounded. */
export function markTabUsed(throttled = false): void {
  if (getTunnelConnectionStatus() !== 'connected') return;
  lastUsedAt = Date.now();
  if (throttled && lastUsedAt - lastReportedAt < REPORT_THROTTLE_MS) return;
  lastReportedAt = lastUsedAt;
  for (const listener of listeners) listener(lastUsedAt);
}

/** Explicitly claims the tunnel for this tab, bypassing the "must already be
 * active" gate above — the one way a tab without the tunnel can take it from
 * whichever tab currently has it (TunnelTakeoverGate's "Take over" button). */
export function claimTunnelActive(): void {
  lastUsedAt = Date.now();
  lastReportedAt = lastUsedAt;
  for (const listener of listeners) listener(lastUsedAt);
}

/** Calls `listener` whenever this tab is used; returns an unsubscribe. */
export function onTabUsed(listener: (at: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
