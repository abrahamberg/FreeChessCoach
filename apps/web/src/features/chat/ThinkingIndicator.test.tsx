import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ThinkingIndicator } from './ThinkingIndicator.js';

describe('ThinkingIndicator (design.md §5.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders nothing when not thinking', () => {
    render(<ThinkingIndicator visible={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('does not appear immediately (avoids flicker on fast replies)', () => {
    render(<ThinkingIndicator visible={true} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('appears after a 300ms delay', () => {
    render(<ThinkingIndicator visible={true} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('status', { name: /coach is thinking/i })).toBeInTheDocument();
  });

  test('shows a custom label alongside the dots when provided', () => {
    render(<ThinkingIndicator visible={true} label="Studying your game…" />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('status', { name: /studying your game/i })).toBeInTheDocument();
    expect(screen.getByText('Studying your game…')).toBeInTheDocument();
  });

  test('falls back to the default "coach is thinking" label when none is given', () => {
    render(<ThinkingIndicator visible={true} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('status', { name: /coach is thinking/i })).toBeInTheDocument();
  });

  test('disappears immediately once no longer visible', () => {
    const { rerender } = render(<ThinkingIndicator visible={true} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<ThinkingIndicator visible={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
