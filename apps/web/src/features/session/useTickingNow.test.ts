import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useTickingNow } from './useTickingNow.js';

describe('useTickingNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  test('advances with the clock while active', () => {
    const { result } = renderHook(() => useTickingNow(true, 100));
    expect(result.current).toBe(1_000_000);

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(result.current).toBe(1_000_300);
  });

  test('holds still while inactive, and stops its timer', () => {
    const { result } = renderHook(() => useTickingNow(false, 100));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(1_000_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
