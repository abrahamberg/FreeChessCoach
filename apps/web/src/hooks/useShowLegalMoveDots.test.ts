import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { useShowLegalMoveDots } from './useShowLegalMoveDots.js';

describe('useShowLegalMoveDots', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('defaults to on', () => {
    const { result } = renderHook(() => useShowLegalMoveDots());
    expect(result.current[0]).toBe(true);
  });

  test('persists an off choice across mounts', () => {
    const first = renderHook(() => useShowLegalMoveDots());
    act(() => first.result.current[1](false));
    first.unmount();

    expect(renderHook(() => useShowLegalMoveDots()).result.current[0]).toBe(false);
  });

  test('a change in one mounted instance is reflected by another already-mounted instance', () => {
    const settings = renderHook(() => useShowLegalMoveDots());
    const board = renderHook(() => useShowLegalMoveDots());

    act(() => settings.result.current[1](false));

    expect(board.result.current[0]).toBe(false);
  });
});
