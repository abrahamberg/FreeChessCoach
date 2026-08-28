import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ClockDisplay } from './ClockDisplay.js';

describe('ClockDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows the initial remaining time for both sides', () => {
    render(
      <ClockDisplay whiteRemainingMs={300000} blackRemainingMs={280000} activeColor="white" anchoredAt={0} onExpire={vi.fn()} />
    );

    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('4:40')).toBeInTheDocument();
  });

  test('only the active side ticks down over time', () => {
    render(
      <ClockDisplay whiteRemainingMs={300000} blackRemainingMs={280000} activeColor="white" anchoredAt={0} onExpire={vi.fn()} />
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText('4:50')).toBeInTheDocument();
    expect(screen.getByText('4:40')).toBeInTheDocument();
  });

  test('calls onExpire once when the active side reaches 0', () => {
    const onExpire = vi.fn();
    render(<ClockDisplay whiteRemainingMs={1000} blackRemainingMs={280000} activeColor="white" anchoredAt={0} onExpire={onExpire} />);

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });
});
