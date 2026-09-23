import { LlmTunnelAdapter, type LlmTunnelTransport } from './llm-tunnel-transport.js';
import { EngineTunnelAdapter, type EngineTunnelTransport } from './engine-tunnel-transport.js';
import { UnifiedTunnelRegistry } from './unified-tunnel-registry.js';

/** The api process's browser tunnel (GET /api/tunnel) and one transport per
 * request kind over it. Built once in server.ts; the worker uses the relay
 * transports instead. */
export interface BrowserTunnel {
  registry: UnifiedTunnelRegistry;
  engineTransport: EngineTunnelTransport;
  llmTransport: LlmTunnelTransport;
}

export function buildBrowserTunnel(): BrowserTunnel {
  const registry = new UnifiedTunnelRegistry();
  return {
    registry,
    engineTransport: new EngineTunnelAdapter(registry),
    llmTransport: new LlmTunnelAdapter(registry)
  };
}
