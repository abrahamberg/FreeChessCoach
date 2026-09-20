import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PositionAnalysis } from '@freechesscoach/shared';
import { createLightEngineCooldown, LIGHT_ENGINE_COOLDOWN_MS, verifyWithLightFirst } from './bot-verify.js';

function analysis(cp: number): PositionAnalysis {
  return {
    fen: 'x',
    depth: 8,
    multiPv: 1,
    bestMove: 'e5',
    eval: { cp, mateIn: null },
    lines: [{ moveUci: 'e7e5', moveSan: 'e5', pvSan: ['e5'], cp, mateIn: null }],
    features: {} as PositionAnalysis['features']
  };
}

describe('verifyWithLightFirst', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('uses the light engine when it answers, and never touches the bot\'s own engine', async () => {
    const light = vi.fn().mockResolvedValue(analysis(10));
    const fallback = vi.fn();

    const result = await verifyWithLightFirst(light, fallback)('fen');

    expect(result.eval.cp).toBe(10);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('falls back to the bot\'s own engine when there is no light engine (no tab connected)', async () => {
    const light = vi.fn().mockRejectedValue(new Error('No tunnel connection'));
    const fallback = vi.fn().mockResolvedValue(analysis(-20));

    const result = await verifyWithLightFirst(light, fallback)('fen');

    expect(result.eval.cp).toBe(-20);
    expect(fallback).toHaveBeenCalledWith('fen');
  });

  test('falls back when the light engine does not answer in time', async () => {
    const light = vi.fn().mockReturnValue(new Promise(() => undefined));
    const fallback = vi.fn().mockResolvedValue(analysis(5));

    const pending = verifyWithLightFirst(light, fallback, { timeoutMs: 4000 })('fen');
    await vi.advanceTimersByTimeAsync(4000);

    expect((await pending).eval.cp).toBe(5);
  });

  test('falls back when the light engine answers with nothing', async () => {
    const empty = { ...analysis(0), lines: [], bestMove: null };
    const fallback = vi.fn().mockResolvedValue(analysis(7));

    const result = await verifyWithLightFirst(vi.fn().mockResolvedValue(empty), fallback)('fen');

    expect(result.eval.cp).toBe(7);
  });

  test('when both fail, the bot\'s own engine\'s error is the one that surfaces', async () => {
    const light = vi.fn().mockRejectedValue(new Error('no tab'));
    const fallback = vi.fn().mockRejectedValue(new Error('engine down'));

    await expect(verifyWithLightFirst(light, fallback)('fen')).rejects.toThrow('engine down');
  });

  test('after the light engine fails, later checks skip it entirely until the cooldown ends', async () => {
    let clock = 0;
    const cooldown = createLightEngineCooldown(() => clock);
    const light = vi.fn().mockRejectedValue(new Error('no tab'));
    const fallback = vi.fn().mockResolvedValue(analysis(1));
    const verify = verifyWithLightFirst(light, fallback, { cooldown });

    await verify('a');
    await verify('b');
    await verify('c');
    expect(light).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(3);

    clock = LIGHT_ENGINE_COOLDOWN_MS + 1;
    await verify('d');
    expect(light).toHaveBeenCalledTimes(2);
  });

  test('a light engine that answers never starts a cooldown', async () => {
    const cooldown = createLightEngineCooldown();
    const light = vi.fn().mockResolvedValue(analysis(3));

    await verifyWithLightFirst(light, vi.fn(), { cooldown })('fen');
    await verifyWithLightFirst(light, vi.fn(), { cooldown })('fen');

    expect(light).toHaveBeenCalledTimes(2);
    expect(cooldown.isCoolingDown()).toBe(false);
  });
});
