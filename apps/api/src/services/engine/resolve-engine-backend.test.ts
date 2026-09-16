import { afterEach, describe, expect, test, vi, beforeAll, afterAll } from 'vitest';
import type { Kysely } from 'kysely';
import { ENGINE_TUNNEL_PER_POSITION_MS } from '@freechesscoach/shared';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import * as usersRepo from '../../db/repositories/users.js';
import type { Database } from '../../db/schema.js';
import { resolveEngineBackend, resolveRawEngineBackend, type ResolveEngineBackendOptions } from './resolve-engine-backend.js';
import type { EngineTunnelTransport } from './engine-tunnel-transport.js';
import type { LichessEvalReader } from './lichess-eval-index.js';

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

  function options(
    tunnelTransport: EngineTunnelTransport,
    overrides: Partial<ResolveEngineBackendOptions> = {}
  ): ResolveEngineBackendOptions {
    return {
      db,
      engineUrl: 'http://engine:4001',
      tunnelTransport,
      tunnelTimeoutMs: 8000,
      chessApiTimeoutMs: 5000,
      chessApiRequestDelayMs: 0,
      lichessEvalIndex: null,
      lichessEvalMinDepth: 16,
      ...overrides
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

  test('when lichessEvalIndex is configured and hits, the underlying engine is never called, regardless of engineMode', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Dee' });
    // A real, legal position — unlike the other tests' opaque fen strings,
    // this one is actually parsed (uciToSan, computePositionFeatures) by
    // LichessEvalEngineBackend on a hit.
    const fen = 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = { request: vi.fn() };
    const lichessEvalIndex: LichessEvalReader = {
      lookup: vi.fn().mockResolvedValue({ depth: 40, lines: [{ cp: 20, mate: null, pvUci: ['e7e5'] }] })
    };

    const backend = await resolveEngineBackend(options(tunnelTransport, { lichessEvalIndex }), user.id);
    const result = await backend.analyzePosition(fen);

    expect(result.eval).toEqual({ cp: 20, mateIn: null });
    expect(result.bestMove).toBe('e5');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tunnelTransport.request).not.toHaveBeenCalled();
  });

  test('when lichessEvalIndex is configured but misses, the request still falls through to the underlying engine', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Eli' });
    const fen = `lichess-miss-${crypto.randomUUID()}`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ analysis: { fen, depth: 1, multiPv: 1, bestMove: null, eval: { cp: null, mateIn: null }, lines: [], features: {} } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const tunnelTransport: EngineTunnelTransport = { request: vi.fn() };
    const lichessEvalIndex: LichessEvalReader = { lookup: vi.fn().mockResolvedValue(null) };

    const backend = await resolveEngineBackend(options(tunnelTransport, { lichessEvalIndex }), user.id);
    await backend.analyzePosition(fen);

    expect(fetchMock).toHaveBeenCalled();
  });

  test('resolveRawEngineBackend bypasses CachingEngineBackend — repeated calls for the same fen hit the raw backend every time', async () => {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Cam' });
    // A real FEN, not just a unique token — resolveRawEngineBackend's chain
    // now includes LiteSupplementedEngineBackend (Phase 63), whose
    // needsSupplement check parses this with chess.js.
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    // A fresh Response per call — this test calls analyzePosition twice, and
    // a Response's body can only be read once (mockResolvedValue would reuse
    // the same instance and throw "Body has already been read" on the second
    // call's `.json()`).
    // Five lines — enough that needsSupplement (Phase 63) sees no shortfall
    // on the very first call, so this test's own fetch-call-count assertion
    // below isn't muddied by an unrelated lite-supplement retry.
    const lines = ['Nf6', 'Nc6', 'd5', 'e6', 'c5'].map((moveSan) => ({ moveUci: '0000', moveSan, pvSan: [moveSan], cp: 0, mateIn: null }));
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ analysis: { fen, depth: 1, multiPv: 1, bestMove: null, eval: { cp: null, mateIn: null }, lines, features: {} } }), {
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

  describe('engine-source-usage logging', () => {
    test('resolveEngineBackend with no lichessEvalIndex logs the fallback engine, tagged internal for "native"', async () => {
      const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Fay' });
      const fen = `log-native-${crypto.randomUUID()}`;
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ analysis: { fen, depth: 1, multiPv: 1, bestMove: null, eval: { cp: null, mateIn: null }, lines: [], features: {} } }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        )
      );
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const backend = await resolveEngineBackend(options({ request: vi.fn() }), user.id);
      await backend.analyzePosition(fen);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('internalEngine=1'));
      logSpy.mockRestore();
    });

    test('resolveEngineBackend with a lichessEvalIndex hit logs it as lichessIndex, not the fallback engine', async () => {
      const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Gus' });
      const fen = 'rnbqkbnr/pppppppp/8/8/8/6N1/PPPPPPPP/RNBQKB1R b KQkq - 1 1';
      vi.stubGlobal('fetch', vi.fn());
      const lichessEvalIndex: LichessEvalReader = {
        lookup: vi.fn().mockResolvedValue({ depth: 40, lines: [{ cp: 5, mate: null, pvUci: ['e7e5'] }] })
      };
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const backend = await resolveEngineBackend(options({ request: vi.fn() }, { lichessEvalIndex }), user.id);
      await backend.analyzePosition(fen);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('lichessIndex=1'));
      logSpy.mockRestore();
    });

    test('resolveRawEngineBackend (bot path) also logs engine usage, tagged external for "browser" mode', async () => {
      const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Hana' });
      await usersRepo.update(db, user.id, { engineMode: 'browser' });
      // A real FEN, not just a unique token — see the same note above.
      const fen = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
      // Five lines, one per ENGINE_MULTI_PV slot — enough that
      // LiteSupplementedEngineBackend's needsSupplement check (Phase 63)
      // sees no shortfall and never reaches for the lite tunnel, which
      // would otherwise fire unmocked here and fail this test for a reason
      // unrelated to what it actually checks (the externalEngine log tag).
      const lines = ['Nf6', 'Nc6', 'd5', 'e6', 'c5'].map((moveSan) => ({
        moveUci: '0000',
        moveSan,
        pvSan: [moveSan],
        cp: 0,
        mateIn: null
      }));
      const tunnelTransport: EngineTunnelTransport = {
        request: vi.fn().mockResolvedValue({
          fen,
          depth: 1,
          multiPv: 1,
          bestMove: null,
          eval: { cp: null, mateIn: null },
          lines,
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
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const backend = await resolveRawEngineBackend(options(tunnelTransport), user.id);
      await backend.analyzePosition(fen);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('externalEngine=1'));
      logSpy.mockRestore();
    });
  });
});
