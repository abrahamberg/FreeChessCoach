import { describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { createMemoryRatingEvalStore, scheduleRatingEval } from './bot-rating-evals.js';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function analysis(lines: PositionAnalysis['lines'] = [{ moveUci: 'e2e4', moveSan: 'e4', pvSan: ['e4'], cp: 30, mateIn: null }]): PositionAnalysis {
  return { fen: FEN, depth: 8, multiPv: 6, bestMove: 'e4', eval: { cp: 30, mateIn: null }, lines, features: {} as PositionAnalysis['features'] };
}

describe('createMemoryRatingEvalStore', () => {
  test('forgets the oldest position once past its limit', async () => {
    const store = createMemoryRatingEvalStore(2);
    const value = { ply: 0, fen: 'x', depth: 8, lines: [] };

    await store.set('a', value);
    await store.set('b', value);
    await store.set('c', value);

    expect([await store.get('a'), await store.get('b'), await store.get('c')].map(Boolean)).toEqual([false, true, true]);
  });

  test('setting a position again makes it the newest, not the next to go', async () => {
    const store = createMemoryRatingEvalStore(2);
    const value = { ply: 0, fen: 'x', depth: 8, lines: [] };

    await store.set('a', value);
    await store.set('b', value);
    await store.set('a', value);
    await store.set('c', value);

    expect([await store.get('a'), await store.get('b'), await store.get('c')].map(Boolean)).toEqual([true, false, true]);
  });
});

describe('scheduleRatingEval', () => {
  test('stores the light engine\'s eval of the position once it answers', async () => {
    const ratingEvals = createMemoryRatingEvalStore();

    scheduleRatingEval({ ratingEvals, analyzeLight: vi.fn().mockResolvedValue(analysis()) }, FEN);

    await vi.waitFor(async () => expect((await ratingEvals.get(FEN))?.lines.map((line) => line.moveSan)).toEqual(['e4']));
  });

  test('does not ask again for a position it already has', async () => {
    const ratingEvals = createMemoryRatingEvalStore();
    await ratingEvals.set(FEN, { ply: 0, fen: FEN, depth: 8, lines: [] });
    const get = vi.spyOn(ratingEvals, 'get');
    const analyzeLight = vi.fn();

    scheduleRatingEval({ ratingEvals, analyzeLight }, FEN);
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(analyzeLight).not.toHaveBeenCalled();
  });

  test('does nothing without a light engine or a store', () => {
    const analyzeLight = vi.fn();

    scheduleRatingEval({ ratingEvals: createMemoryRatingEvalStore() }, FEN);
    scheduleRatingEval({ analyzeLight }, FEN);

    expect(analyzeLight).not.toHaveBeenCalled();
  });

  test('a failed light-engine call is swallowed and stores nothing', async () => {
    const ratingEvals = createMemoryRatingEvalStore();
    const analyzeLight = vi.fn().mockRejectedValue(new Error('No tunnel connection'));

    scheduleRatingEval({ ratingEvals, analyzeLight }, FEN);
    await vi.waitFor(() => expect(analyzeLight).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await ratingEvals.get(FEN)).toBeUndefined();
  });

  test('an answer with no lines is not stored — it could only mis-rate', async () => {
    const ratingEvals = createMemoryRatingEvalStore();
    const analyzeLight = vi.fn().mockResolvedValue(analysis([]));

    scheduleRatingEval({ ratingEvals, analyzeLight }, FEN);
    await vi.waitFor(() => expect(analyzeLight).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await ratingEvals.get(FEN)).toBeUndefined();
  });
});
