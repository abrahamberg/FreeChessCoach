import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MoveNavPills } from './MoveNavPills.js';

describe('MoveNavPills', () => {
  test('shows the current position and steps to prev/next/first/last', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MoveNavPills ply={3} totalPlies={7} onSelect={onSelect} />);

    expect(screen.getByText('move 3 of 7')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByRole('button', { name: /next move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByRole('button', { name: /first move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(0);

    await user.click(screen.getByRole('button', { name: /last move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(7);
  });

  test('disables first/previous at the start and next/last at the end', () => {
    const { rerender } = render(<MoveNavPills ply={0} totalPlies={7} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /first move/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous move/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next move/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /last move/i })).toBeEnabled();

    rerender(<MoveNavPills ply={7} totalPlies={7} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /first move/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /previous move/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next move/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /last move/i })).toBeDisabled();
  });
});
