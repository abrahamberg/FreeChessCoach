import type { EngineEval } from '@freechesscoach/shared';
import { describe, expect, test, vi } from 'vitest';
import { initialReviewEngine } from './review-engine-choice.js';
import { ReviewEngineSwitch, SLOW_MS_PER_POSITION } from './review-engine-switch.js';
import { ServerEngineUnavailableError } from './server-review-engine.js';

const evalsOf = (fens: string[]): EngineEval[] => fens.map((fen, ply) => ({ ply, fen, depth: 12, lines: [] }));
const SIX = ['a', 'b', 'c', 'd', 'e', 'f'];

/** A device whose batches take `msPerPosition` each position on a fake clock. */
function setup(initial = initialReviewEngine(null, null, {}), msPerPosition = 100) {
  let clock = 0;
  const device = vi.fn(async (fens: string[]) => {
    clock += fens.length * msPerPosition;
    return evalsOf(fens);
  });
  const server = vi.fn(async (fens: string[]) => evalsOf(fens));
  return { engines: new ReviewEngineSwitch(initial, { device, server, now: () => clock }), device, server };
}

describe('choosing the free review engine', () => {
  test('a phone, a data saver or a small machine starts on the server; a link or an earlier pick wins', () => {
    expect(initialReviewEngine(null, null, { mobile: true })).toEqual({ engine: 'server', reason: 'slow_device' });
    expect(initialReviewEngine(null, null, { cores: 2, memoryGb: 8 })).toEqual({ engine: 'server', reason: 'slow_device' });
    expect(initialReviewEngine(null, null, { cores: 8, memoryGb: 8 })).toEqual({ engine: 'device', reason: 'default' });
    expect(initialReviewEngine(null, 'device', { mobile: true })).toEqual({ engine: 'device', reason: 'chosen' });
    expect(initialReviewEngine('device', 'server', { mobile: true })).toEqual({ engine: 'device', reason: 'link' });
  });

  test('a device measured slow moves the rest of the review to the server', async () => {
    const { engines, device, server } = setup(undefined, SLOW_MS_PER_POSITION + 500);
    await engines.analyze(SIX, 3); // the first batch includes starting the engine
    expect(engines.status.engine).toBe('device');
    await engines.analyze(SIX, 3);
    expect(engines.status).toEqual({ engine: 'server', reason: 'slow_measured' });
    await engines.analyze(SIX, 3);
    expect(device).toHaveBeenCalledTimes(2);
    expect(server).toHaveBeenCalledTimes(1);
    expect(engines.used).toEqual(['device', 'server']);
  });

  test('a device the visitor chose stays, however slow', async () => {
    const { engines } = setup({ engine: 'device', reason: 'chosen' }, SLOW_MS_PER_POSITION * 4);
    for (let i = 0; i < 3; i += 1) await engines.analyze(SIX, 3);
    expect(engines.status).toEqual({ engine: 'device', reason: 'chosen' });
  });

  test('a server refusal finishes the review on the device and does not go back to the server', async () => {
    const { engines, device, server } = setup({ engine: 'server', reason: 'slow_device' }, SLOW_MS_PER_POSITION * 4);
    server.mockRejectedValueOnce(new ServerEngineUnavailableError(429));
    const evals = await engines.analyze(SIX, 3);
    expect(evals).toHaveLength(6);
    expect(engines.status).toEqual({ engine: 'device', reason: 'server_unavailable' });
    await engines.analyze(SIX, 3);
    await engines.analyze(SIX, 3);
    expect(server).toHaveBeenCalledTimes(1);
    expect(device).toHaveBeenCalledTimes(3);
  });
});
