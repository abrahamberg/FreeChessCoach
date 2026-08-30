import { describe, expect, test } from 'vitest';
import { analyzeGame, analyzePosition, analyzePositionDetailed, InvalidFenError } from './analyze.js';
import { EnginePool } from './engine-pool.js';
import { UciEngine, type AnalyzeOptions, type DetailedEngineLine } from './uci.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const bestLine: DetailedEngineLine = { moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null, pvUci: ['e2e4', 'e7e5'] };

class FakeDetailedUciEngine extends UciEngine {
  constructor(private readonly impl: (fen: string, options: AnalyzeOptions) => Promise<DetailedEngineLine[]>) {
    super();
  }

  override analyzeDetailed(fen: string, options: AnalyzeOptions = {}): Promise<DetailedEngineLine[]> {
    return this.impl(fen, options);
  }
}

function poolReturningDetailed(lines: DetailedEngineLine[]): EnginePool {
  return new EnginePool(1, () => new FakeDetailedUciEngine(() => Promise.resolve(lines)));
}

describe('analyzePosition', () => {
  test('returns an EngineEval with the given ply, fen, depth, and each line\'s pvSan (same search analyzeDetailed already ran)', async () => {
    const pool = poolReturningDetailed([bestLine]);

    const result = await analyzePosition(pool, START_FEN, 3, { depth: 14 });

    expect(result).toEqual({
      ply: 3,
      fen: START_FEN,
      depth: 14,
      lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null, pvSan: ['e4', 'e5'] }]
    });
  });

  test('throws InvalidFenError for a malformed fen without calling the engine', async () => {
    let called = false;
    const pool = new EnginePool(1, () => new FakeDetailedUciEngine(() => {
      called = true;
      return Promise.resolve([bestLine]);
    }));

    await expect(analyzePosition(pool, 'not-a-fen', 0, { depth: 10 })).rejects.toThrow(InvalidFenError);
    expect(called).toBe(false);
  });

  test('forwards depth, multiPv, and timeoutMs to the engine', async () => {
    const seen: AnalyzeOptions[] = [];
    const pool = new EnginePool(1, () => new FakeDetailedUciEngine((_fen, options) => {
      seen.push(options);
      return Promise.resolve([bestLine]);
    }));

    await analyzePosition(pool, START_FEN, 0, { depth: 10, multiPv: 3, timeoutMs: 2000 });

    expect(seen).toEqual([{ depth: 10, multiPv: 3, timeoutMs: 2000 }]);
  });
});

describe('analyzeGame', () => {
  test('analyzes each fen sequentially, assigning ply by array index', async () => {
    const fens = [START_FEN, AFTER_E4_FEN];
    const seenFens: string[] = [];
    const pool = new EnginePool(1, () => new FakeDetailedUciEngine((fen) => {
      seenFens.push(fen);
      return Promise.resolve([bestLine]);
    }));

    const evals = await analyzeGame(pool, fens, { depth: 8 });

    expect(evals.map((e) => e.ply)).toEqual([0, 1]);
    expect(evals.map((e) => e.fen)).toEqual(fens);
    expect(seenFens).toEqual(fens);
  });

  test('rejects with InvalidFenError if any fen is malformed', async () => {
    const pool = poolReturningDetailed([bestLine]);

    await expect(analyzeGame(pool, [START_FEN, 'garbage'], { depth: 8 })).rejects.toThrow(
      InvalidFenError
    );
  });
});

describe('analyzePositionDetailed', () => {
  const detailedBestLine: DetailedEngineLine = {
    moveUci: 'e2e4',
    moveSan: 'e4',
    cp: 30,
    mateIn: null,
    pvUci: ['e2e4', 'e7e5', 'g1f3']
  };

  test('assembles fen/depth/multiPv, best move, eval, full-PV lines, and static features', async () => {
    const pool = poolReturningDetailed([detailedBestLine]);

    const result = await analyzePositionDetailed(pool, START_FEN, { depth: 14 });

    expect(result.fen).toBe(START_FEN);
    expect(result.depth).toBe(14);
    expect(result.multiPv).toBe(1);
    expect(result.bestMove).toBe('e4');
    expect(result.eval).toEqual({ cp: 30, mateIn: null });
    expect(result.lines).toEqual([{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4', 'e5', 'Nf3'], cp: 30, mateIn: null }]);
    expect(result.features.turn).toBe('white');
    expect(result.features.boardState).toBe('none');
  });

  test('bestMove/eval are null when the engine returns no lines (no legal moves)', async () => {
    const pool = poolReturningDetailed([]);

    const result = await analyzePositionDetailed(pool, START_FEN, { depth: 14 });

    expect(result.bestMove).toBeNull();
    expect(result.eval).toEqual({ cp: null, mateIn: null });
    expect(result.lines).toEqual([]);
  });

  test('throws InvalidFenError for a malformed fen without calling the engine', async () => {
    let called = false;
    const pool = new EnginePool(1, () => new FakeDetailedUciEngine(() => {
      called = true;
      return Promise.resolve([detailedBestLine]);
    }));

    await expect(analyzePositionDetailed(pool, 'not-a-fen', { depth: 10 })).rejects.toThrow(InvalidFenError);
    expect(called).toBe(false);
  });
});
