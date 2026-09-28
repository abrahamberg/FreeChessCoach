import { afterEach, describe, expect, test, vi } from 'vitest';
import { browserProgressStore, importBrowserProgress, localToday } from './course-progress.js';

const key = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -|e7e5';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('course progress in the browser', () => {
  test('a drill result is scheduled here before sign-in', async () => {
    await browserProgressStore.record([{ key, san: 'e5', courseSlug: 'englund', correct: false }]);
    const state = (await browserProgressStore.lookup([key, 'other'])).get(key);
    expect(state).toMatchObject({ step: 0 });
    expect(state!.dueOn! > localToday()).toBe(true);
  });

  test('moved to the account on sign-in, then cleared here', async () => {
    await browserProgressStore.record([{ key, san: 'e5', courseSlug: 'englund', correct: true }]);
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetch);
    await importBrowserProgress();
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).items).toMatchObject([{ key, step: 1 }]);
    expect((await browserProgressStore.lookup([key])).size).toBe(0);
    await importBrowserProgress();
    expect(fetch).toHaveBeenCalledOnce();
  });

  test('the day is the learner’s own', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
