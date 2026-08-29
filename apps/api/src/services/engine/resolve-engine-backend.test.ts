import { afterEach, describe, expect, test, vi, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { ENGINE_TUNNEL_PER_POSITION_MS } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { resolveEngineBackend, resolveRawEngineBackend, type ResolveEngineBackendOptions } from './resolve-engine-backend.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';

describe('resolveEngineBackend', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  afterEach(() => vi.unstubAllGlobals());

  function options(tunnelTransport: EngineTunnelTransport): ResolveEngineBackendOptions {
    return {
      db,
      engineUrl: 'http://engine:4001',
      tunnelTransport,
      tunnelTimeoutMs: 8000,
      chessApiTimeoutMs: 5000,
      chessApiRequestDelayMs: 0
    };
  }

  // Each test analyzes its own unique FEN: position_evaluations is keyed by fen
  // alone (shared across users), and resolveEngineBackend wraps every backend in
  // CachingEngineBackend — so reusing one FEN here would let whichever test ran
  // first serve the other from cache, and the raw backend under test would never
  // be called at all.
  const NATIVE_FEN = `native-${crypto.randomUUID()}`;
  const BROWSER_FEN = `browser-${crypto.randomUUID()}`;
  const CHESS_API_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  test('engineMode "native" resolves to a backend that calls the engine HTTP API, not the tunnel', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ analysis: { fen: NATIVE_FEN, depth: 1, multiPv: 1, bestMove: null, eval: { cp: null, mateIn: null }, lines: [], features: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = { request: vi.fn() };

    const backend = await resolveEngineBackend(options(tunnelTransport), user.id);
    await backend.analyzePosition(NATIVE_FEN);

    expect(fetchMock).toHaveBeenCalled();
    expect(tunnelTransport.request).not.toHaveBeenCalled();
  });

  test('engineMode "chess_api" resolves to a backend that calls chess-api.com, not the engine HTTP API or the tunnel', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Cara' });
    await usersRepo.update(db, user.id, { engineMode: 'chess_api' });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ move: 'e2e4', san: 'e4', eval: 0.3, mate: null }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = { request: vi.fn() };

    const backend = await resolveEngineBackend(options(tunnelTransport), user.id);
    await backend.analyzePosition(CHESS_API_FEN);

    expect(fetchMock).toHaveBeenCalledWith('https://chess-api.com/v1', expect.objectContaining({ method: 'POST' }));
    expect(tunnelTransport.request).not.toHaveBeenCalled();
  });

  test('engineMode "browser" resolves to a backend that calls the tunnel transport, not the engine HTTP API', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ben' });
    await usersRepo.update(db, user.id, { engineMode: 'browser' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = {
      request: vi.fn().mockResolvedValue({
        fen: BROWSER_FEN,
        depth: 1,
        multiPv: 1,
        bestMove: null,
        eval: { cp: null, mateIn: null },
        lines: [],
        features: {
          turn: 'white',
          boardState: 'none',
          availableMoves: [],
          mobility: { white: 0, black: 0 },
          controlledSquares: [],
          piecesUnderAttack: [],
          hangingPieces: [],
          underDefendedPieces: [],
          overloadedDefenders: [],
          centerControlScore: { white: 0, black: 0 },
          openFiles: [],
          semiOpenFiles: [],
          doubledPawns: [],
          isolatedPawns: [],
          passedPawns: [],
          targetsAttacked: [],
          forks: [],
          captureOpportunities: []
        }
      })
    };

    const backend = await resolveEngineBackend(options(tunnelTransport), user.id);
    await backend.analyzePosition(BROWSER_FEN);

    expect(tunnelTransport.request).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ kind: 'analyze-position' }),
      8000 + ENGINE_TUNNEL_PER_POSITION_MS
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('resolveRawEngineBackend bypasses CachingEngineBackend — repeated calls for the same fen hit the raw backend every time', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Cam' });
    const fen = `raw-${crypto.randomUUID()}`;
    // A fresh Response per call — this test calls analyzePosition twice, and
    // a Response's body can only be read once (mockResolvedValue would reuse
    // the same instance and throw "Body has already been read" on the second
    // call's `.json()`).
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ analysis: { fen, depth: 1, multiPv: 1, bestMove: null, eval: { cp: null, mateIn: null }, lines: [], features: {} } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = { request: vi.fn() };

    const backend = await resolveRawEngineBackend(options(tunnelTransport), user.id);
    await backend.analyzePosition(fen);
    await backend.analyzePosition(fen);

    // A CachingEngineBackend-wrapped backend would only ever hit fetch once
    // (see the "native" test above) — the raw backend must be called every time.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
