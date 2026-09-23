import { randomUUID } from 'crypto';
import type { TunnelPayload } from '@freechesscoach/shared';
import { createChunkQueue } from './tunnel-chunk-queue.js';
import {
  handleInbound,
  rejectAll,
  sendOrReject,
  trySend,
  TunnelError,
  type ConnectionState,
  type TunnelConnection
} from './tunnel-connection-state.js';

export { TunnelError, type TunnelConnection };

export interface TunnelStreamOptions {
  /** Fails the stream when no frame arrives for this long. Every frame resets it. */
  idleTimeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Holds each user's browser tunnel connection and routes correlated requests
 * to it: engine analysis, chess-api.com fetches and local-LLM calls all share
 * the one socket (message shapes: packages/shared/src/tunnel.ts). Requests
 * fail fast with TunnelError when the user has no connection, on timeout, or
 * on an error frame. Lives in the api process only; the worker reaches it
 * through the internal relay route.
 */
export class UnifiedTunnelRegistry {
  /** Each user's open tabs, in the order they connected. */
  private connections = new Map<string, ConnectionState[]>();

  /** Adds a tab's connection. Every open tab stays registered, background
   * ones included: each keeps answering what it already has. New requests go
   * to the tab the user used most recently (the `active` frame). A tie —
   * most commonly a brand-new tab, which always starts at 0 — goes to
   * whichever tab already held the role, not the new one: opening (or even
   * focusing) another tab must never itself hand the tunnel over. The only
   * ways it moves are an explicit takeover (a tab deliberately sending a
   * fresher `active` than the current holder) or the active tab closing, at
   * which point the next most recently used remaining tab takes over so a
   * reloaded or closed tab never leaves a still-open one unreachable. */
  registerConnection(userId: string, connection: TunnelConnection): void {
    const state: ConnectionState = { connection, pending: new Map(), lastUsedAt: 0 };
    connection.onmessage = (event) => handleInbound(state, event.data, () => this.announceRoles(userId));
    this.connections.set(userId, [...(this.connections.get(userId) ?? []), state]);
    this.announceRoles(userId);
  }

  /** Tells each of the user's tabs whether it is the one new requests go to,
   * so a background tab's topbar can say it is inactive. */
  private announceRoles(userId: string): void {
    const active = this.mostRecentlyUsed(userId);
    for (const state of this.connections.get(userId) ?? []) {
      const isActive = state === active;
      if (state.announcedActive === isActive) continue;
      state.announcedActive = isActive;
      trySend(state, JSON.stringify({ type: 'role', active: isActive }));
    }
  }

  /** Drops a tab's connection and fails the requests it was answering.
   * Without `connection`, drops all of the user's tabs. */
  unregisterConnection(userId: string, connection?: TunnelConnection): void {
    const states = this.connections.get(userId) ?? [];
    const closing = connection ? states.filter((state) => state.connection === connection) : states;
    const remaining = states.filter((state) => !closing.includes(state));
    for (const state of closing) rejectAll(state, 'Connection unregistered');
    if (remaining.length > 0) this.connections.set(userId, remaining);
    else this.connections.delete(userId);
    this.announceRoles(userId);
  }

  isConnected(userId: string): boolean {
    return this.connections.has(userId);
  }

  private mostRecentlyUsed(userId: string): ConnectionState | undefined {
    let chosen: ConnectionState | undefined;
    for (const state of this.connections.get(userId) ?? []) {
      // Strictly greater, not >=: a tie keeps the earlier (incumbent)
      // connection instead of handing off to whichever registered last.
      if (!chosen || state.lastUsedAt > chosen.lastUsedAt) chosen = state;
    }
    return chosen;
  }

  /** Sends one request and resolves with the tab's `result`. Aborting
   * `signal` rejects immediately and tells the tab to cancel, instead of
   * leaving the caller (and whatever slot it holds, e.g. LlmCallQueue) stuck
   * until `timeoutMs`. */
  request(userId: string, payload: TunnelPayload, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const state = this.mostRecentlyUsed(userId);
    if (!state) return Promise.reject(new TunnelError(`No tunnel connection for user ${userId}`));
    const requestId = randomUUID();

    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', onAbort);
      };
      const timeoutId = setTimeout(() => {
        state.pending.delete(requestId);
        cleanup();
        reject(new TunnelError(`Tunnel request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const onAbort = (): void => {
        state.pending.delete(requestId);
        cleanup();
        trySend(state, JSON.stringify({ type: 'cancel', requestId }));
        reject(new TunnelError('Tunnel request aborted'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      state.pending.set(requestId, {
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        }
      });
      sendOrReject(state, requestId, JSON.stringify({ ...payload, requestId }));
    });
  }

  /** Sends one streaming request and yields each chunk frame's payload as it
   * arrives. Breaking out of the loop (or aborting) tells the tab to cancel. */
  async *stream(userId: string, payload: TunnelPayload, options: TunnelStreamOptions): AsyncGenerator<string> {
    const state = this.mostRecentlyUsed(userId);
    if (!state) throw new TunnelError(`No tunnel connection for user ${userId}`);
    const requestId = randomUUID();
    const queue = createChunkQueue();
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdle = (): void => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => queue.fail(new TunnelError(`Tunnel stream idle for ${options.idleTimeoutMs}ms`)),
        options.idleTimeoutMs
      );
    };
    const onAbort = (): void => queue.fail(new TunnelError('Tunnel stream aborted'));

    let settled = false;
    state.pending.set(requestId, {
      resolve: () => {
        settled = true;
        queue.end();
      },
      reject: (error) => {
        settled = true;
        queue.fail(error);
      },
      chunk: (chunk) => {
        resetIdle();
        queue.push(chunk);
      },
      done: () => {
        settled = true;
        queue.end();
      }
    });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    resetIdle();
    sendOrReject(state, requestId, JSON.stringify({ ...payload, requestId }));

    try {
      yield* queue;
    } finally {
      clearTimeout(idleTimer);
      options.signal?.removeEventListener('abort', onAbort);
      state.pending.delete(requestId);
      if (!settled) trySend(state, JSON.stringify({ type: 'cancel', requestId }));
    }
  }
}
