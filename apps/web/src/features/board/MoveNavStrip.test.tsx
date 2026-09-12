import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { MoveNavStrip } from './MoveNavStrip.js';

const SAN_MOVES = ['e4', 'e5', 'Nf3', 'Nc6'];

describe('MoveNavStrip', () => {
  test('steps to the previous/next move', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MoveNavStrip sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} ply={2} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole('button', { name: /next move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(3);
  });

  test('disables previous at the start and next at the end', () => {
    const { rerender } = render(
      <MoveNavStrip sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} ply={0} onSelect={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /previous move/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next move/i })).toBeEnabled();

    rerender(<MoveNavStrip sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} ply={4} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /previous move/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next move/i })).toBeDisabled();
  });

  test('clicking a move chip in the embedded MoveStrip forwards the 1-based ply', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MoveNavStrip sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} ply={0} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Nf3' }));
    expect(onSelect).toHaveBeenLastCalledWith(3);
  });
});
