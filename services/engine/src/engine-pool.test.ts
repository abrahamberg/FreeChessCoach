import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { resolveTestStockfishPath } from '../test/helpers/stockfish-path.js';
import { EnginePool } from './engine-pool.js';
import { UciEngine } from './uci.js';

const STOCKFISH_PATH = resolveTestStockfishPath();
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('EnginePool', () => {
  let pool: EnginePool;

  beforeAll(() => {
    pool = new EnginePool(1, () => new UciEngine({ stockfishPath: STOCKFISH_PATH }));
  });

  afterAll(async () => {
    await pool.quitAll();
  });

  test('serializes calls beyond the pool size', async () => {
    const events: string[] = [];

    const run = (label: string) =>
      pool.withEngine(async (engine) => {
        events.push(`${label}:start`);
        await engine.analyze(START_FEN, { depth: 12, multiPv: 1 });
        events.push(`${label}:end`);
      });

    await Promise.all([run('a'), run('b')]);

    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  }, 20000);

  test('exposes size and a busy count that rises and falls around withEngine', async () => {
    const busyDuring: number[] = [];

    await pool.withEngine(async (engine) => {
      busyDuring.push(pool.busy);
      await engine.analyze(START_FEN, { depth: 6, multiPv: 1 });
    });

    expect(pool.size).toBe(1);
    expect(busyDuring).toEqual([1]);
    expect(pool.busy).toBe(0);
  }, 20000);
});

/** A live bot move (priority 'interactive') must never queue FIFO behind a
 * background batch job (import analysis, deepen-analysis) that got to the
 * pool first — see EnginePrioritySchema's doc comment. No real Stockfish
 * process needed here: this is purely about acquire/release queue ordering,
 * so a stub stands in for the engine value withEngine hands to its callback. */
describe('EnginePool priority', () => {
  function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  }

  test('serves a freed engine to a waiting interactive call before an earlier-queued background one', async () => {
    const pool = new EnginePool(1, () => ({}) as UciEngine);
    const order: string[] = [];
    const gate = deferred();

    // Occupies the pool's only engine synchronously (idle.pop() runs before
    // the first await), so both calls below are guaranteed to queue as
    // waiters rather than race for an idle engine.
    const holder = pool.withEngine(async () => {
      order.push('holder:start');
      await gate.promise;
      order.push('holder:end');
    }, 'background');

    const backgroundWaiter = pool.withEngine(async () => {
      order.push('background');
    }, 'background');
    const interactiveWaiter = pool.withEngine(async () => {
      order.push('interactive');
    }, 'interactive');

    gate.resolve();
    await Promise.all([holder, backgroundWaiter, interactiveWaiter]);

    expect(order).toEqual(['holder:start', 'holder:end', 'interactive', 'background']);
  });
});
