import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LichessGamePicker } from './LichessGamePicker.js';

const GAMES = [
  {
    id: 'abcd1234',
    pgn: '1. e4 e5 1-0',
    whiteName: 'daniel',
    blackName: 'Marta',
    result: '1-0',
    timeControl: '600+0',
    playedAt: '2026-07-20T10:00:00.000Z'
  }
];

describe('LichessGamePicker', () => {
  test('renders a row per game (same format as the games list) and selecting it calls onSelect with its pgn', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<LichessGamePicker games={GAMES} isLoading={false} isLinked={true} onSelect={onSelect} />);

    expect(screen.getByText(/daniel/)).toBeInTheDocument();
    expect(screen.getByText(/marta/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /daniel.*marta/is }));
    expect(onSelect).toHaveBeenCalledWith(GAMES[0]!.pgn);
  });

  test('shows a link-account hint when the user has no linked Lichess username', () => {
    render(<LichessGamePicker games={[]} isLoading={false} isLinked={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/link your lichess account/i)).toBeInTheDocument();
  });

  test('shows a loading state while fetching', () => {
    render(<LichessGamePicker games={[]} isLoading={true} isLinked={true} onSelect={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('shows an empty state when linked but no recent games', () => {
    render(<LichessGamePicker games={[]} isLoading={false} isLinked={true} onSelect={vi.fn()} />);
    expect(screen.getByText(/no recent games/i)).toBeInTheDocument();
  });

  describe('bulk selection (Task 31.4 stat-bank import)', () => {
    test('renders a checkbox per row and an "Import N for stat bank" button reflecting the selection count', () => {
      const onToggle = vi.fn();
      render(
        <LichessGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(['abcd1234']), onToggle, onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      expect(screen.getByRole('checkbox', { name: /select daniel.*marta/is })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Import 1 for stat bank' })).toBeInTheDocument();
    });

    test('checking a row calls onToggle with its id, without calling onSelect', async () => {
      const onSelect = vi.fn();
      const onToggle = vi.fn();
      const user = userEvent.setup();
      render(
        <LichessGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          onSelect={onSelect}
          bulkSelection={{ selectedIds: new Set(), onToggle, onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      await user.click(screen.getByRole('checkbox'));

      expect(onToggle).toHaveBeenCalledWith('abcd1234');
      expect(onSelect).not.toHaveBeenCalled();
    });

    test('clicking a row\'s button still calls onSelect immediately, even in bulk mode', async () => {
      const onSelect = vi.fn();
      const user = userEvent.setup();
      render(
        <LichessGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          onSelect={onSelect}
          bulkSelection={{ selectedIds: new Set(), onToggle: vi.fn(), onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      await user.click(screen.getByRole('button', { name: /daniel.*marta/is }));
      expect(onSelect).toHaveBeenCalledWith(GAMES[0]!.pgn);
    });

    test('the "Import N for stat bank" button is disabled with no selection and calls onImportSelected when clicked', async () => {
      const onImportSelected = vi.fn();
      const user = userEvent.setup();
      render(
        <LichessGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(), onToggle: vi.fn(), onImportSelected, isImporting: false }}
        />
      );

      expect(screen.getByRole('button', { name: 'Import 0 for stat bank' })).toBeDisabled();

      render(
        <LichessGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(['abcd1234']), onToggle: vi.fn(), onImportSelected, isImporting: false }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Import 1 for stat bank' }));
      expect(onImportSelected).toHaveBeenCalled();
    });
  });
});
