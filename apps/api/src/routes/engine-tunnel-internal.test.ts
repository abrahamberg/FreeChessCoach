import Fastify from 'fastify';
import { describe, expect, test, vi } from 'vitest';
import { EngineUnavailableError } from '../lib/errors.js';
import { LlmTunnelError, type LlmTunnelTransport } from '../services/engine/llm-tunnel-transport.js';
import { registerEngineTunnelInternalRoutes } from './engine-tunnel-internal.js';

function buildRelay(engine = vi.fn(async () => 'engine-result'), llm = vi.fn(async () => 'llm-result')) {
  const app = Fastify();
  const llmTransport: LlmTunnelTransport = { request: llm, stream: async function* () {} };
  registerEngineTunnelInternalRoutes(app, { engineTransport: { request: engine }, llmTransport, internalToken: 'secret' });
  return { app, engine, llm };
}

const post = (app: ReturnType<typeof Fastify>, payload: object) =>
  app.inject({ method: 'POST', url: '/internal/engine-tunnel/u1', headers: { 'x-internal-token': 'secret' }, payload });

describe('POST /internal/engine-tunnel/:userId', () => {
  test('sends LLM requests through the LLM transport (and its queue) at the given priority', async () => {
    const { app, engine, llm } = buildRelay();
    const response = await post(app, { kind: 'llm', subKind: 'chat', baseUrl: 'http://localhost:1234/v1', body: {}, timeoutMs: 1000 });
    expect(response.json()).toEqual({ result: 'llm-result' });
    expect(llm).toHaveBeenCalledWith('u1', { kind: 'llm', subKind: 'chat', baseUrl: 'http://localhost:1234/v1', body: {} }, { timeoutMs: 1000, priority: 'background' });
    expect(engine).not.toHaveBeenCalled();
  });

  test('sends engine requests to the engine transport', async () => {
    const { app, engine } = buildRelay();
    const payload = { kind: 'engine', subKind: 'analyze-position', fen: 'f', depth: 8, multiPv: 1 };
    const response = await post(app, { ...payload, timeoutMs: 1000 });
    expect(response.json()).toEqual({ result: 'engine-result' });
    expect(engine).toHaveBeenCalledWith('u1', payload, 1000);
  });

  test('reports a missing tab as 503 for either kind', async () => {
    const { app } = buildRelay(
      vi.fn(async () => {
        throw new EngineUnavailableError('No tunnel');
      }),
      vi.fn(async () => {
        throw new LlmTunnelError('No tunnel');
      })
    );
    const engine = await post(app, { kind: 'fetch', url: 'https://chess-api.com/v1', method: 'POST', timeoutMs: 1000 });
    const llm = await post(app, { kind: 'llm', subKind: 'fetch-models', baseUrl: 'http://localhost:1234/v1', timeoutMs: 1000 });
    expect(engine.statusCode).toBe(503);
    expect(llm.statusCode).toBe(503);
  });

  test('rejects a caller without the internal token', async () => {
    const { app } = buildRelay();
    const response = await app.inject({ method: 'POST', url: '/internal/engine-tunnel/u1', payload: {} });
    expect(response.statusCode).toBe(401);
  });
});
