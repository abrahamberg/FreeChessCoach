/** One tab's tunnel socket as the registry sees it, and how frames on it
 * are sent and routed (UnifiedTunnelRegistry holds these per user). */

export class TunnelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TunnelError';
  }
}

/** Minimal WebSocket-like connection interface for tunnel communication. */
export interface TunnelConnection {
  send(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
}

export interface PendingRequest {
  resolve(result: unknown): void;
  reject(error: Error): void;
  chunk?(chunk: string): void;
  done?(): void;
}

export interface ConnectionState {
  connection: TunnelConnection;
  pending: Map<string, PendingRequest>;
  /** When the user last used this tab, by the tab's own clock (the `active`
   * frame); all of one user's tabs share a browser clock. */
  lastUsedAt: number;
  /** The role last announced to the tab (`role` frame), so it is only resent on a change. */
  announcedActive?: boolean;
}

/** One inbound frame from the tab, loosely typed: it is untrusted JSON. */
interface InboundFrame {
  type?: unknown;
  requestId?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: unknown;
  chunk?: unknown;
  done?: unknown;
  at?: unknown;
}

export function sendOrReject(state: ConnectionState, requestId: string, message: string): void {
  try {
    state.connection.send(message);
  } catch (error) {
    const pending = state.pending.get(requestId);
    state.pending.delete(requestId);
    pending?.reject(new TunnelError(`Failed to send tunnel request: ${String(error)}`));
  }
}

export function trySend(state: ConnectionState, message: string): void {
  try {
    state.connection.send(message);
  } catch {
    // The socket is going away; its close handler fails what is left.
  }
}

export function rejectAll(state: ConnectionState, reason: string): void {
  const pending = [...state.pending.values()];
  state.pending.clear();
  for (const request of pending) request.reject(new TunnelError(reason));
}

function parseFrame(raw: string): InboundFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as InboundFrame) : null;
  } catch {
    return null;
  }
}

export function handleInbound(state: ConnectionState, raw: string, onUsed: () => void): void {
  const frame = parseFrame(raw);
  if (!frame) {
    // Log only that it happened: the text can be a local LLM's output.
    console.error('[Unified Tunnel] Ignored a malformed tunnel message');
    return;
  }
  if (frame.type === 'ping') {
    trySend(state, JSON.stringify({ type: 'pong' }));
    return;
  }
  if (frame.type === 'active') {
    if (typeof frame.at === 'number' && Number.isFinite(frame.at)) state.lastUsedAt = frame.at;
    onUsed();
    return;
  }
  if (typeof frame.requestId !== 'string') return;
  const pending = state.pending.get(frame.requestId);
  if (!pending) return;
  routeFrame(state, frame.requestId, pending, frame);
}

function routeFrame(state: ConnectionState, requestId: string, pending: PendingRequest, frame: InboundFrame): void {
  if (typeof frame.chunk === 'string' && pending.chunk) {
    pending.chunk(frame.chunk);
    return;
  }
  state.pending.delete(requestId);
  if (typeof frame.error === 'string') {
    pending.reject(new TunnelError(frame.error));
    return;
  }
  if (frame.done === true && pending.done) {
    pending.done();
    return;
  }
  if (frame.result !== undefined) {
    pending.resolve(frame.result);
    return;
  }
  pending.reject(new TunnelError('Invalid response: missing result or error'));
}
