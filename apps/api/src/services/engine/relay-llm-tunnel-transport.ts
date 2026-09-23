import type { LlmTunnelPayload } from '@freechesscoach/shared';
import { LlmTunnelError, type LlmTunnelCallOptions, type LlmTunnelTransport } from './llm-tunnel-transport.js';

export interface RelayLlmTunnelTransportOptions {
  apiInternalUrl: string;
  internalToken: string;
}

/** worker.ts's LlmTunnelTransport: the worker never holds a browser
 * WebSocket, so it asks the api process over the internal relay route
 * (routes/engine-tunnel-internal.ts), where the call joins the same per-user
 * queue as the api's own local-LLM calls. Worker jobs only make whole
 * (non-streamed) calls, so streaming is not relayed. */
export class RelayLlmTunnelTransport implements LlmTunnelTransport {
  constructor(private readonly options: RelayLlmTunnelTransportOptions) {}

  async request(userId: string, payload: LlmTunnelPayload, options: LlmTunnelCallOptions): Promise<unknown> {
    const response = await fetch(`${this.options.apiInternalUrl}/internal/engine-tunnel/${userId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': this.options.internalToken },
      body: JSON.stringify({ ...payload, timeoutMs: options.timeoutMs, priority: options.priority }),
      signal: options.signal
    });
    if (response.status === 503) {
      const body = (await response.json()) as { title?: string };
      throw new LlmTunnelError(body.title ?? 'Local LLM tunnel unavailable');
    }
    if (!response.ok) throw new Error(`local LLM tunnel relay failed: HTTP ${response.status}`);
    const body = (await response.json()) as { result: unknown };
    return body.result;
  }

  stream(): AsyncIterable<string> {
    throw new LlmTunnelError('Streaming local LLM calls are not relayed from the worker');
  }
}
