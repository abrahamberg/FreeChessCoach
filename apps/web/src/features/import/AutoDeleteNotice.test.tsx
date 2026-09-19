import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { AUTO_DELETE_BATCH, MAX_LIBRARY_GAMES, type ImportQuotaResponse } from '@freechesscoach/shared';
import { AutoDeleteNotice, useAutoDeleteNotice, willAutoDelete } from './AutoDeleteNotice.js';

function quota(libraryUsed: number): ImportQuotaResponse {
  return {
    daily: { used: 0, limit: 30 },
    weekly: { used: 0, limit: 150 },
    inFlight: { used: 0, limit: 10 },
    library: { used: libraryUsed, limit: MAX_LIBRARY_GAMES, autoDeleteCount: libraryUsed >= MAX_LIBRARY_GAMES ? AUTO_DELETE_BATCH : 0 }
  };
}

describe('willAutoDelete', () => {
  test.each([
    [999, 1, false],
    [MAX_LIBRARY_GAMES, 1, true],
    [MAX_LIBRARY_GAMES - 1, 2, true],
    [MAX_LIBRARY_GAMES - 5, 5, false],
    [MAX_LIBRARY_GAMES - 5, 10, true],
    [0, 10, false]
  ])('library at %i importing %i → %s', (used, count, expected) => {
    expect(willAutoDelete(quota(used), count)).toBe(expected);
  });

  test('never warns while the quota has not loaded', () => {
    expect(willAutoDelete(undefined, 10)).toBe(false);
  });
});

describe('AutoDeleteNotice', () => {
  test('says how many games are held, how many will go, and that their stats are kept', () => {
    render(<AutoDeleteNotice used={MAX_LIBRARY_GAMES} limit={MAX_LIBRARY_GAMES} count={AUTO_DELETE_BATCH} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText(`You have ${MAX_LIBRARY_GAMES} of ${MAX_LIBRARY_GAMES} games. Importing will delete your ${AUTO_DELETE_BATCH} earliest games. Their stats are kept.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import and delete' })).toBeInTheDocument();
  });

  test('confirm and cancel call their handlers', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<AutoDeleteNotice used={1000} limit={1000} count={50} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Import and delete' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('useAutoDeleteNotice', () => {
  test('runs the import straight away when nothing will be deleted', () => {
    const action = vi.fn();
    const { result } = renderHook(() => useAutoDeleteNotice(quota(10)));

    act(() => result.current.guard(1, action));

    expect(action).toHaveBeenCalledOnce();
    expect(result.current.notice).toBeNull();
  });

  test('holds the import behind the notice when it would delete, and runs it only on confirm', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useAutoDeleteNotice(quota(MAX_LIBRARY_GAMES)));

    act(() => result.current.guard(1, action));
    expect(action).not.toHaveBeenCalled();
    expect(result.current.notice).not.toBeNull();

    render(result.current.notice);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Import and delete' }));

    expect(action).toHaveBeenCalledOnce();
  });

  test('cancelling runs nothing and closes the notice', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useAutoDeleteNotice(quota(MAX_LIBRARY_GAMES)));
    act(() => result.current.guard(1, action));

    render(result.current.notice);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));

    expect(action).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
  });
});
