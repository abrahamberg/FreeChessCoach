import type { Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import type { EngineEval, PositionAnalysis } from '@freechesscoach/shared';
import * as positionEvaluationsRepo from '../../db/repositories/position-evaluations.js';
import type { Database } from '../../db/schema.js';
import { createTestDb, type TestDb } from '../../../test/helpers/db.js';
import type { EngineBackend } from './engine-backend.js';
import { CachingEngineBackend, toDetailedAnalysis, toLeanEval } from './caching-engine-backend.js';

const FEN_A = '8/8/8/8/8/8/4K3/4k3 w - - 0 1';
const FEN_B = '8/8/8/8/8/8/3K4/3k4 w - - 0 1';
const FEN_C = '8/8/8/8/8/8/2K5/2k5 w - - 0 1';

function makePositionAnalysis(fen: string, cp: number): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 3,
    bestMove: 'Ke2',
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'e2e3', moveSan: 'Ke2', pvSan: ['Ke2', 'Ke7'], cp, mateIn: null }],
    features: computePositionFeatures(fen)
  };
}

function makeEngineEval(fen: string, ply: number, cp: number): EngineEval {
  return {
    ply,
    fen,
    depth: 18,
    lines: [{ moveUci: 'e2e3', moveSan: 'Ke2', cp, mateIn: null }]
  };
}

function makeEngineEvalWithPv(fen: string, ply: number, cp: number, pvSan: string[]): EngineEval {
  return {
    ply,
    fen,
    depth: 18,
    lines: [{ moveUci: 'e2e3', moveSan: 'Ke2', cp, mateIn: null, pvSan }]
  };
}

/** A two-line analysis with `cp` ordered backwards for the side to move
 * (both test FENs have White to move, so a correct pair has firstLine.cp >=
 * secondLine.cp) — used to simulate a stale/corrupted cache row that
 * violates `assertEvalSignConvention`. */
function makeSignViolatingAnalysis(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 2,
    bestMove: 'Ke2',
    eval: { cp: 5, mateIn: null },
    lines: [
      { moveUci: 'e2e3', moveSan: 'Ke2', pvSan: ['Ke2'], cp: 5, mateIn: null },
      { moveUci: 'e2d3', moveSan: 'Kd2', pvSan: ['Kd2'], cp: 20, mateIn: null }
    ],
    features: computePositionFeatures(fen)
  };
}

/** A single-line analysis whose only line has neither `cp` nor `mateIn` —
 * simulates chess-api.com returning an incomplete/malformed response for a
 * non-terminal position (observed in production: a `multiPv: 1` row with
 * `lines: [{cp: null, mateIn: null, ...}]`, which `assertEvalSignConvention`
 * can't catch on its own since it needs a second line to compare against). */
function makeEmptyScoreAnalysis(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 1,
    bestMove: null,
    eval: { cp: null, mateIn: null },
    lines: [{ moveUci: 'e2e3', moveSan: 'Ke2', pvSan: ['Ke2'], cp: null, mateIn: null }],
    features: computePositionFeatures(fen)
  };
}

/** Partial mock satisfying EngineBackend — both methods are vi.fn(), so
 * tests can assert exactly when/how often the raw backend was called. */
function fakeRawBackend() {
  return {
    analyzePosition: vi.fn<EngineBackend['analyzePosition']>(),
    analyzeGame: vi.fn<EngineBackend['analyzeGame']>()
  } satisfies EngineBackend;
}

describe('CachingEngineBackend', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  beforeEach(async () => {
    await db.deleteFrom('positionEvaluations').execute();
  });

  test('analyzePosition miss: computes via raw backend and writes cache', async () => {
    const raw = fakeRawBackend();
    const analysis = makePositionAnalysis(FEN_A, 15);
    raw.analyzePosition.mockResolvedValue(analysis);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const result = await backend.analyzePosition(FEN_A);

    expect(result).toEqual(analysis);
    expect(raw.analyzePosition).toHaveBeenCalledTimes(1);
    expect(raw.analyzePosition).toHaveBeenCalledWith(FEN_A, undefined);

    const cached = await positionEvaluationsRepo.findByFen(db, FEN_A, { allowExternal: false });
    expect(cached).toEqual(analysis);
  });

  test('analyzePosition hit: raw backend not called again on repeat', async () => {
    const raw = fakeRawBackend();
    const analysis = makePositionAnalysis(FEN_A, 15);
    raw.analyzePosition.mockResolvedValue(analysis);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const first = await backend.analyzePosition(FEN_A);
    const second = await backend.analyzePosition(FEN_A);

    expect(first).toEqual(analysis);
    expect(second).toEqual(analysis);
    expect(raw.analyzePosition).toHaveBeenCalledTimes(1);
  });

  test('analyzePosition browser->native heal: a browser-written row does not block native from healing', async () => {
    // Seed the cache as if a prior browser-tunnel call wrote it.
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: FEN_A, depth: 10, multiPv: 3, analysis: makePositionAnalysis(FEN_A, -99) }],
      { isExternalEval: true }
    );

    const raw = fakeRawBackend();
    const healedAnalysis = makePositionAnalysis(FEN_A, 42);
    raw.analyzePosition.mockResolvedValue(healedAnalysis);

    // Native-mode caller: allowExternal is false, so the browser-written row
    // must be treated as a miss, not a hit.
    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const result = await backend.analyzePosition(FEN_A);

    expect(result).toEqual(healedAnalysis);
    expect(raw.analyzePosition).toHaveBeenCalledTimes(1);

    const row = await db
      .selectFrom('positionEvaluations')
      .selectAll()
      .where('fen', '=', FEN_A)
      .executeTakeFirstOrThrow();
    expect(row.isExternalEval).toBe(false);
    expect((row.analysis as PositionAnalysis).eval.cp).toBe(42);
  });

  test('analyzePosition cache hit violating sign convention: treated as a miss and self-heals', async () => {
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: FEN_A, depth: 16, multiPv: 2, analysis: makeSignViolatingAnalysis(FEN_A) }],
      { isExternalEval: false }
    );

    const raw = fakeRawBackend();
    const healedAnalysis = makePositionAnalysis(FEN_A, 42);
    raw.analyzePosition.mockResolvedValue(healedAnalysis);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const result = await backend.analyzePosition(FEN_A);

    expect(result).toEqual(healedAnalysis);
    expect(raw.analyzePosition).toHaveBeenCalledTimes(1);

    const cached = await positionEvaluationsRepo.findByFen(db, FEN_A, { allowExternal: false });
    expect(cached).toEqual(healedAnalysis);
  });

  test('analyzePosition cache hit with an empty score (no cp, no mateIn): treated as a miss and self-heals', async () => {
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: FEN_A, depth: 16, multiPv: 1, analysis: makeEmptyScoreAnalysis(FEN_A) }],
      { isExternalEval: false }
    );

    const raw = fakeRawBackend();
    const healedAnalysis = makePositionAnalysis(FEN_A, 42);
    raw.analyzePosition.mockResolvedValue(healedAnalysis);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const result = await backend.analyzePosition(FEN_A);

    expect(result).toEqual(healedAnalysis);
    expect(raw.analyzePosition).toHaveBeenCalledTimes(1);
  });

  test('analyzeGame cache hit violating sign convention: treated as a miss and self-heals', async () => {
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: FEN_B, depth: 16, multiPv: 2, analysis: makeSignViolatingAnalysis(FEN_B) }],
      { isExternalEval: false }
    );

    const raw = fakeRawBackend();
    raw.analyzeGame.mockResolvedValue([makeEngineEval(FEN_B, 0, 7)]);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const results = await backend.analyzeGame([FEN_B]);

    expect(raw.analyzeGame).toHaveBeenCalledTimes(1);
    expect(raw.analyzeGame).toHaveBeenCalledWith([FEN_B], undefined);
    expect(results[0]!.lines[0]!.cp).toBe(7);

    const cached = await positionEvaluationsRepo.findByFen(db, FEN_B, { allowExternal: false });
    expect(cached?.lines[0]!.cp).toBe(7);
  });

  test('analyzeGame partial cache: only misses are sent to the backend, results merge back in original order', async () => {
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: FEN_B, depth: 16, multiPv: 3, analysis: makePositionAnalysis(FEN_B, 7) }],
      { isExternalEval: false }
    );

    const raw = fakeRawBackend();
    raw.analyzeGame.mockResolvedValue([makeEngineEval(FEN_A, 0, 99)]);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    // FEN_A appears twice (duplicate ply content) to exercise de-duplication.
    const results = await backend.analyzeGame([FEN_A, FEN_B, FEN_A]);

    // Only the genuine miss (FEN_A), de-duplicated, is sent to the backend.
    expect(raw.analyzeGame).toHaveBeenCalledTimes(1);
    expect(raw.analyzeGame).toHaveBeenCalledWith([FEN_A], undefined);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ fen: FEN_A, ply: 0 });
    expect(results[0]!.lines[0]!.cp).toBe(99);
    expect(results[1]).toMatchObject({ fen: FEN_B, ply: 1 });
    expect(results[1]!.lines[0]!.cp).toBe(7);
    expect(results[2]).toMatchObject({ fen: FEN_A, ply: 2 });
    expect(results[2]!.lines[0]!.cp).toBe(99);

    // The miss was written to cache with a degraded (single-move) PV.
    const cachedA = await positionEvaluationsRepo.findByFen(db, FEN_A, { allowExternal: false });
    expect(cachedA?.lines[0]!.pvSan).toEqual(['Ke2']);
  });

  test('analyzeGame write to cache: a repeat call hits fully, without calling the backend again', async () => {
    const raw = fakeRawBackend();
    raw.analyzeGame.mockResolvedValue([makeEngineEval(FEN_A, 0, 11), makeEngineEval(FEN_C, 1, 22)]);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const first = await backend.analyzeGame([FEN_A, FEN_C]);
    const second = await backend.analyzeGame([FEN_A, FEN_C]);

    expect(raw.analyzeGame).toHaveBeenCalledTimes(1);
    expect(first.map((entry) => entry.lines[0]!.cp)).toEqual([11, 22]);
    expect(second.map((entry) => entry.lines[0]!.cp)).toEqual([11, 22]);
    expect(second.map((entry) => entry.ply)).toEqual([0, 1]);
  });

  test('analyzeGame write to cache then hit: a fresh multi-move pvSan survives the cache round trip (Phase 44)', async () => {
    const raw = fakeRawBackend();
    raw.analyzeGame.mockResolvedValue([makeEngineEvalWithPv(FEN_A, 0, 15, ['Ke2', 'Ke7', 'Kd2'])]);

    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });
    const first = await backend.analyzeGame([FEN_A]);
    const second = await backend.analyzeGame([FEN_A]);

    expect(raw.analyzeGame).toHaveBeenCalledTimes(1);
    expect(first[0]!.lines[0]!.pvSan).toEqual(['Ke2', 'Ke7', 'Kd2']);
    expect(second[0]!.lines[0]!.pvSan).toEqual(['Ke2', 'Ke7', 'Kd2']);

    const cached = await positionEvaluationsRepo.findByFen(db, FEN_A, { allowExternal: false });
    expect(cached?.lines[0]!.pvSan).toEqual(['Ke2', 'Ke7', 'Kd2']);
  });

  test('toLeanEval: a legacy analysis line lacking pvSan round-trips as undefined, not a fabricated array (Phase 44)', () => {
    const analysis = makePositionAnalysis(FEN_A, 15);
    // Simulate a pre-pvSan-field DB row cast to PositionAnalysis at read time.
    const legacyLine = { ...analysis.lines[0]! } as { pvSan?: string[] };
    delete legacyLine.pvSan;
    const legacyAnalysis = { ...analysis, lines: [legacyLine] } as PositionAnalysis;

    const lean = toLeanEval(legacyAnalysis);

    expect(lean.lines[0]!.pvSan).toBeUndefined();
  });

  test('toDetailedAnalysis: preserves an already-present multi-move pvSan untouched (Phase 44)', () => {
    const evalResult = makeEngineEvalWithPv(FEN_A, 0, 15, ['Ke2', 'Ke7', 'Kd2']);

    const analysis = toDetailedAnalysis(FEN_A, evalResult);

    expect(analysis.lines[0]!.pvSan).toEqual(['Ke2', 'Ke7', 'Kd2']);
  });

  test('toDetailedAnalysis: degrades to a single-move pvSan when the line has none (Phase 44)', () => {
    const evalResult = makeEngineEval(FEN_A, 0, 15);

    const analysis = toDetailedAnalysis(FEN_A, evalResult);

    expect(analysis.lines[0]!.pvSan).toEqual(['Ke2']);
  });

  test('analyzeGame empty input: returns [] without touching the backend', async () => {
    const raw = fakeRawBackend();
    const backend = new CachingEngineBackend(db, raw, { isExternalSource: false });

    const result = await backend.analyzeGame([]);

    expect(result).toEqual([]);
    expect(raw.analyzeGame).not.toHaveBeenCalled();
    expect(raw.analyzePosition).not.toHaveBeenCalled();
  });
});
