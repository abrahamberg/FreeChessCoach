import {
  EngineTunnelPayloadSchema,
  FetchTunnelPayloadSchema,
  LlmTunnelPayloadSchema,
  type TunnelResponseMessage
} from '@freechesscoach/shared';
import { useEffect } from 'react';
import { z } from 'zod';
import { runEngineRequest, runFetchRequest } from '../engine/tunnel-engine-handlers.js';
import { cancelLlmRequest, runLlmRequest } from '../engine/tunnel-llm-handlers.js';
import { setTunnelConnectionStatus } from '../engine/tunnel-connection-status.js';
import { getTabLastUsedAt, onTabUsed } from '../engine/tunnel-tab-usage.js';

const InboundSchema = z.union([
  z.object({ type: z.literal('pong') }),
  z.object({ type: z.literal('role'), active: z.boolean() }),
  z.object({ type: z.literal('cancel'), requestId: z.string() }),
  z.intersection(
    z.object({ requestId: z.string() }),
    z.union([EngineTunnelPayloadSchema, FetchTunnelPayloadSchema, LlmTunnelPayloadSchema])
  )
]);

// nginx-ingress closes an idle proxied connection after its default 60s
// proxy-read-timeout, and this tunnel can otherwise sit silent for a long
// time between jobs. A ping well under that (answered with a pong, which this
// client ignores) keeps the connection alive instead of it dying invisibly
// and failing every job with "No tunnel connection" until the tab is reloaded.
const KEEPALIVE_INTERVAL_MS = 20_000;
// A deploy rolling the api pod also closes this socket server-side. Without
// a reconnect, that outage is permanent for the tab's lifetime even though
// the server comes back within seconds.
const RECONNECT_DELAY_MS = 2_000;

function defaultWsUrl(): string {
  return `${window.location.origin.replace(/^http/, 'ws')}/api/tunnel`;
}

/** Keeps this tab's one tunnel (`GET /api/tunnel`) open and answers the
 * server's requests on it: browser-engine analysis, chess-api.com fetches
 * and local-LLM calls. Mounted once at the app root, not per page —
 * background jobs and bot moves can need it at any time. Reconnects on any
 * close (idle timeout or a server redeploy). Every open tab keeps its own
 * tunnel and tells the server when it was last used (`active`). */
export function useUnifiedTunnelClient(enabled: boolean, wsUrl?: string): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const url = wsUrl ?? defaultWsUrl();
    let socket: WebSocket | undefined;
    let keepaliveId: ReturnType<typeof setInterval> | undefined;
    let reconnectId: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    function connect(): void {
      setTunnelConnectionStatus('connecting');
      const current = new WebSocket(url);
      socket = current;
      current.onmessage = (event: MessageEvent<string>) => {
        void handleMessage(current, event.data);
      };
      current.onopen = () => {
        if (stopped) return;
        // Stays 'connecting' (not 'connected') until the server's `role`
        // frame says which of this tab's kind actually holds the tunnel —
        // otherwise an inactive tab would flash as connected for the one
        // round trip before its real role arrives.
        sendRaw(current, { type: 'active', at: getTabLastUsedAt() });
        keepaliveId = setInterval(() => sendRaw(current, { type: 'ping' }), KEEPALIVE_INTERVAL_MS);
      };
      current.onclose = () => {
        setTunnelConnectionStatus('disconnected');
        if (keepaliveId !== undefined) clearInterval(keepaliveId);
        if (!stopped) reconnectId = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }
    // With several tabs open, the server sends new requests to the one used
    // last (engine/tunnel-tab-usage.ts).
    const stopReporting = onTabUsed((at) => {
      if (socket) sendRaw(socket, { type: 'active', at });
    });
    connect();

    return () => {
      stopped = true;
      stopReporting();
      setTunnelConnectionStatus('disconnected');
      if (keepaliveId !== undefined) clearInterval(keepaliveId);
      if (reconnectId !== undefined) clearTimeout(reconnectId);
      socket?.close();
    };
  }, [enabled, wsUrl]);
}

async function handleMessage(socket: WebSocket, raw: string): Promise<void> {
  const parsed = InboundSchema.safeParse(safeJson(raw));
  if (!parsed.success) {
    const requestId = requestIdOf(raw);
    if (requestId) send(socket, { requestId, ok: false, error: 'This tab could not read the request; reload the page.' });
    return;
  }
  const message = parsed.data;
  if ('type' in message) {
    if (message.type === 'cancel') cancelLlmRequest(message.requestId);
    if (message.type === 'role') setTunnelConnectionStatus(message.active ? 'connected' : 'inactive');
    return;
  }
  const { requestId } = message;
  try {
    if (message.kind === 'engine') send(socket, { requestId, ok: true, result: await runEngineRequest(message) });
    else if (message.kind === 'fetch') send(socket, { requestId, ok: true, result: await runFetchRequest(message) });
    else
      await runLlmRequest(requestId, message, {
        result: (result) => send(socket, { requestId, ok: true, result }),
        chunk: (chunk) => send(socket, { requestId, chunk }),
        done: () => send(socket, { requestId, done: true })
      });
  } catch (error) {
    send(socket, { requestId, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function send(socket: WebSocket, message: TunnelResponseMessage): void {
  sendRaw(socket, message);
}

function sendRaw(socket: WebSocket, message: object): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requestIdOf(raw: string): string | null {
  const value = safeJson(raw);
  if (typeof value !== 'object' || value === null) return null;
  const requestId = (value as { requestId?: unknown }).requestId;
  return typeof requestId === 'string' ? requestId : null;
}
