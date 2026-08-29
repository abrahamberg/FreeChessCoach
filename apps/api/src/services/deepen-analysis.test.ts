import type { Kysely } from 'kysely';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import * as gamesRepo from '../db/repositories/games.js';
import * as positionEvaluationsRepo from '../db/repositories/position-evaluations.js';
import * as usersRepo from '../db/repositories/users.js';
import type { Database } from '../db/schema.js';
import { createTestDb, type TestDb } from '../../test/helpers/db.js';
import { runDeepenAnalysisJob, type DeepenAnalysisJobDependencies } from './deepen-analysis.js';

// 15 plies (> BATCH_SIZE of 10) so the job spans more than one batch.
const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 *`;

function makePositionAnalysis(fen: string): PositionAnalysis {
  return {
    fen,
    depth: 16,
    multiPv: 3,
    bestMove: null,
    eval: { cp: 0, mateIn: null },
    lines: [],
    features: computePositionFeatures(fen)
  };
}

/** A fake `analyzePosition` that persists on every call, exactly like the
 * real `CachingEngineBackend` does on a genuine engine miss — the shape
 * every test in this file except the Lichess-hit regression test below
 * needs, since `runDeepenAnalysisJob` itself deliberately never persists
 * (see deepen-analysis.ts's doc comments). */
function makePersistingAnalyzePosition(db: Kysely<Database>, isExternalEval: boolean) {
  return vi.fn(async (fen: string) => {
    const analysis = makePositionAnalysis(fen);
    await positionEvaluationsRepo.upsertMany(db, [{ fen, depth: analysis.depth, multiPv: analysis.multiPv, analysis }], {
      isExternalEval
    });
    return analysis;
  });
}

describe('runDeepenAnalysisJob', () => {
  let testDb: TestDb;
  let db: Kysely<Database>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  }, 60000);

  afterAll(async () => {
    await testDb.cleanup();
  });

  async function setupGame(): Promise<string> {
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '*',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    return game.id;
  }

  test('computes positions in concurrent batches, not strictly sequentially', async () => {
    const gameId = await setupGame();

    let inFlight = 0;
    let maxInFlight = 0;
    const analyzePosition = vi.fn(async (fen: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      const analysis = makePositionAnalysis(fen);
      await positionEvaluationsRepo.upsertMany(db, [{ fen, depth: analysis.depth, multiPv: analysis.multiPv, analysis }], {
        isExternalEval: false
      });
      return analysis;
    });
    const deps: DeepenAnalysisJobDependencies = { analyzePosition, isExternalSource: false };

    await runDeepenAnalysisJob(db, deps, gameId);

    // A strictly sequential (one-at-a-time) walk would never see more than 1
    // in flight; batching via Promise.all should overlap several calls.
    expect(maxInFlight).toBeGreaterThan(1);
    expect(analyzePosition).toHaveBeenCalledTimes(16);

    const cached = await positionEvaluationsRepo.findManyByFens(
      db,
      analyzePosition.mock.calls.map(([fen]) => fen),
      { allowExternal: false }
    );
    expect(cached.size).toBe(16);
  });

  test('skips positions already cached from another game (keyed by fen alone)', async () => {
    // A different game whose moves diverge immediately, so only the shared
    // starting position collides with what's primed below.
    const DIVERGENT_PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. d4 d5 2. c4 e6 *`;
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: DIVERGENT_PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '*',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analyzePosition = makePersistingAnalyzePosition(db, false);

    // Prime the cache with just the shared starting position before the job runs.
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: startFen, depth: 16, multiPv: 3, analysis: makePositionAnalysis(startFen) }],
      { isExternalEval: false }
    );

    await runDeepenAnalysisJob(db, { analyzePosition, isExternalSource: false }, game.id);

    expect(analyzePosition).not.toHaveBeenCalledWith(startFen);
    // 4 plies played + the (already-cached) start position = 5 total positions.
    expect(analyzePosition).toHaveBeenCalledTimes(4);
  });

  // Regression: this job used to hardcode isExternalEval:false/allowExternal:false
  // no matter which backend actually computed the values, so a browser-tunnel
  // deepen pass silently mislabeled its own untrusted results as native-quality
  // in the shared (fen-keyed, cross-user) cache. Uses an opening no other test
  // in this file plays, so nothing here rides on cache state left by them.
  test('a browser-sourced deepen pass writes rows marked external, not native-trust', async () => {
    const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. b3 e5 2. Bb2 Nc6 3. e3 Nf6 *`;
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '*',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analyzePosition = makePersistingAnalyzePosition(db, true);

    await runDeepenAnalysisJob(db, { analyzePosition, isExternalSource: true }, game.id);

    const fens = analyzePosition.mock.calls.map(([fen]) => fen);
    expect(fens.length).toBeGreaterThan(0);
    const nativeOnly = await positionEvaluationsRepo.findManyByFens(db, fens, { allowExternal: false });
    expect(nativeOnly.size).toBe(0);
    const anyTrust = await positionEvaluationsRepo.findManyByFens(db, fens, { allowExternal: true });
    expect(anyTrust.size).toBe(fens.length);
  });

  test('a browser-sourced deepen pass never overwrites an existing native-trust row', async () => {
    const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. Nf3 Nf6 2. c4 e6 3. g3 *`;
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '*',
      timeControl: null,
      eco: null,
      playedAt: null
    });

    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    await positionEvaluationsRepo.upsertMany(
      db,
      [{ fen: startFen, depth: 16, multiPv: 3, analysis: makePositionAnalysis(startFen) }],
      { isExternalEval: false }
    );

    const analyzePosition = makePersistingAnalyzePosition(db, true);
    await runDeepenAnalysisJob(db, { analyzePosition, isExternalSource: true }, game.id);

    // Read trust for a browser-sourced pass allows external rows, so the
    // already-cached (native-trust) start position should be skipped, not
    // recomputed and re-written as external.
    expect(analyzePosition).not.toHaveBeenCalledWith(startFen);
    const stillNative = await positionEvaluationsRepo.findManyByFens(db, [startFen], { allowExternal: false });
    expect(stillNative.size).toBe(1);
  });

  // Regression: found by actually running a game through the full local
  // pipeline with a Lichess eval index configured (not caught by any test
  // that predated this one) — this job used to unconditionally persist
  // whatever analyzePosition returned, even when analyzePosition was really
  // LichessEvalEngineBackend serving a hit against the pre-built index,
  // which deliberately never writes to position_evaluations (see
  // docs/architecture.md). That silently duplicated Lichess-covered data
  // into the app's own cache on every deepen pass. Simulated here with a
  // non-persisting fake — a real Lichess-hit analyzePosition never touches
  // position_evaluations either.
  test('never force-writes a result whose analyzePosition did not persist it (a Lichess eval index hit)', async () => {
    const PGN = `[Event "Test"]
[White "Ann"]
[Black "Bob"]
[Result "*"]

1. c4 c5 2. Nc3 Nc6 3. g3 g6 *`;
    const user = await usersRepo.insert(db, { email: `${crypto.randomUUID()}@example.com`, displayName: 'Ann' });
    const game = await gamesRepo.insert(db, {
      userId: user.id,
      pgn: PGN,
      source: 'paste',
      userColor: 'white',
      whiteName: 'Ann',
      blackName: 'Bob',
      result: '*',
      timeControl: null,
      eco: null,
      playedAt: null
    });
    const analyzePosition = vi.fn(async (fen: string) => makePositionAnalysis(fen));

    await runDeepenAnalysisJob(db, { analyzePosition, isExternalSource: false }, game.id);

    const fens = analyzePosition.mock.calls.map(([fen]) => fen);
    expect(fens.length).toBeGreaterThan(0);
    const written = await positionEvaluationsRepo.findManyByFens(db, fens, { allowExternal: true });
    expect(written.size).toBe(0);
  });
});
