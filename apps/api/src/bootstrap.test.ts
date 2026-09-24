import { describe, expect, test } from 'vitest';
import { workerConcurrencyFromEnv } from './bootstrap.js';

describe('workerConcurrencyFromEnv', () => {
  test('defaults to two so the next game can start while one is finding tactics', () => {
    expect(workerConcurrencyFromEnv(undefined)).toBe(2);
  });

  test('takes a positive integer', () => {
    expect(workerConcurrencyFromEnv('4')).toBe(4);
    expect(workerConcurrencyFromEnv('1')).toBe(1);
  });

  test('ignores anything that is not a positive integer', () => {
    for (const bad of ['', '0', '-1', '1.5', 'many']) expect(workerConcurrencyFromEnv(bad)).toBe(2);
  });
});
