import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Database } from '../db/schema.js';
import type { JobQueue } from '../jobs/queue.js';
import { UnifiedTunnelRegistry } from '../services/engine/unified-tunnel-registry.js';
import { registerUnifiedTunnelRoutes } from './unified-tunnel.js';

vi.mock('../services/user-profile.js', () => ({
  getOrCreate: vi.fn(async () => ({ id: 'user-signed-in' }))
}));
vi.mock('../db/repositories/analyses.js', () => ({
  findPausedGameIdsForUser: vi.fn(async () => ['paused-game-1', 'paused-game-2'])
}));

const db = {} as Kysely<Database>;
const ENGINE_REQUEST = { kind: 'engine', subKind: 'analyze-position', fen: 'startpos', depth: 8, multiPv: 1 } as const;

async function buildTunnelApp(registry: UnifiedTunnelRegistry, jobQueue: JobQueue): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyWebsocket);
  app.addHook('onRequest', async (request) => {
    request.user = { email: 'signed-in@local.test', displayName: 'Signed In' };
  });
  registerUnifiedTunnelRoutes(app, db, registry, jobQueue);
  await app.ready();
  return app;
}

function fakeJobQueue(): JobQueue {
  return {
    enqueueAnalyzeGame: vi.fn(async () => {}),
    enqueueSummarizeSession: vi.fn(async () => {}),
    enqueueBackfillGameMetadata: vi.fn(async () => {})
  } as unknown as JobQueue;
}

describe('GET /api/tunnel', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });

  test('registers under the authenticated user, never a client-supplied userId', async () => {
    const registry = new UnifiedTunnelRegistry();
    const register = vi.spyOn(registry, 'registerConnection');
    app = await buildTunnelApp(registry, fakeJobQueue());

    const socket = await app.injectWS('/api/tunnel?userId=victim-user');
    await vi.waitFor(() => expect(register).toHaveBeenCalled());

    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]?.[0]).toBe('user-signed-in');
    await expect(registry.request('victim-user', ENGINE_REQUEST, 50)).rejects.toThrow('No tunnel connection');
    socket.terminate();
  });

  test('re-enqueues the user’s paused analyses when the tunnel connects', async () => {
    const jobQueue = fakeJobQueue();
    app = await buildTunnelApp(new UnifiedTunnelRegistry(), jobQueue);

    const socket = await app.injectWS('/api/tunnel');

    await vi.waitFor(() => expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledTimes(2));
    expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledWith('paused-game-1');
    expect(jobQueue.enqueueAnalyzeGame).toHaveBeenCalledWith('paused-game-2');
    socket.terminate();
  });

  test('routes a browser response back to the pending request', async () => {
    const registry = new UnifiedTunnelRegistry();
    app = await buildTunnelApp(registry, fakeJobQueue());
    const socket = await app.injectWS('/api/tunnel');
    socket.on('message', (raw: Buffer) => {
      const { requestId } = JSON.parse(raw.toString()) as { requestId: string };
      socket.send(JSON.stringify({ requestId, ok: true, result: { bestMove: 'e4' } }));
    });

    const result = await vi.waitFor(() => registry.request('user-signed-in', ENGINE_REQUEST, 1000));

    expect(result).toEqual({ bestMove: 'e4' });
    socket.terminate();
  });
});
