import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { useMobileReviewView } from './useMobileReviewView.js';

describe('useMobileReviewView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('starts on the notes panel', () => {
    const { result } = renderHook(() => useMobileReviewView());
    expect(result.current.view).toBe('notes');
  });

  test('remembers the panel the student left on', () => {
    const first = renderHook(() => useMobileReviewView());
    act(() => first.result.current.showBoard());
    first.unmount();

    expect(renderHook(() => useMobileReviewView()).result.current.view).toBe('board');
  });

  test('select() switches panels directly', () => {
    const { result } = renderHook(() => useMobileReviewView());

    act(() => result.current.select('board'));
    expect(result.current.view).toBe('board');

    act(() => result.current.showNotes());
    expect(result.current.view).toBe('notes');
  });
});
