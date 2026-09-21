import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { withDeadline } from './with-deadline.js';

describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('returns the task result when it finishes in time', async () => {
    await expect(withDeadline('x', async () => 42, 500)).resolves.toBe(42);
  });

  test('resolves undefined once the deadline passes, without waiting for the task', async () => {
    const pending = withDeadline('x', () => new Promise<number>(() => undefined), 500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toBeUndefined();
  });

  test('resolves undefined and warns, under its label, when the task fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(withDeadline('store', async () => Promise.reject(new Error('down')), 500)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('store: down');
    warn.mockRestore();
  });
});
