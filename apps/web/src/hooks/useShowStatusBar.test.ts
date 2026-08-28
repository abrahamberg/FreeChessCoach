import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { useShowStatusBar } from './useShowStatusBar.js';

describe('useShowStatusBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('defaults to on', () => {
    const { result } = renderHook(() => useShowStatusBar());
    expect(result.current[0]).toBe(true);
  });

  test('persists an off choice across mounts', () => {
    const first = renderHook(() => useShowStatusBar());
    act(() => first.result.current[1](false));
    first.unmount();

    expect(renderHook(() => useShowStatusBar()).result.current[0]).toBe(false);
  });

  test('a change in one mounted instance is reflected by another already-mounted instance', () => {
    const options = renderHook(() => useShowStatusBar());
    const panel = renderHook(() => useShowStatusBar());

    act(() => options.result.current[1](false));

    expect(panel.result.current[0]).toBe(false);
  });
});
