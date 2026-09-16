import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { useStandaloneDisplay } from './useStandaloneDisplay.js';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

describe('useStandaloneDisplay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window.navigator, 'standalone');
  });

  test('false in a normal browser tab', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useStandaloneDisplay());
    expect(result.current).toBe(false);
  });

  test('true when the display-mode: standalone media query matches (Android/desktop installs)', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useStandaloneDisplay());
    expect(result.current).toBe(true);
  });

  test('true when navigator.standalone is set (iOS Safari home-screen launch)', () => {
    mockMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const { result } = renderHook(() => useStandaloneDisplay());
    expect(result.current).toBe(true);
  });
});
