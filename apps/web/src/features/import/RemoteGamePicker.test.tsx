import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { RemoteGamePicker } from './RemoteGamePicker.js';

const GAMES = [
  {
    id: 'abcd1234',
    pgn: '1. e4 e5 1-0',
    whiteName: 'daniel',
    blackName: 'Marta',
    result: '1-0',
    playedAt: '2026-07-20T10:00:00.000Z'
  }
];

describe('RemoteGamePicker', () => {
  test('renders a row per game (same format as the games list) and selecting it calls onSelect with its pgn and playedAt', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<RemoteGamePicker games={GAMES} isLoading={false} isLinked={true} linkPrompt="Link your account." onSelect={onSelect} />);

    expect(screen.getByText(/daniel/)).toBeInTheDocument();
    expect(screen.getByText(/marta/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^analyze.*daniel.*marta/is }));
    expect(onSelect).toHaveBeenLastCalledWith(GAMES[0]!.pgn, GAMES[0]!.playedAt, 'review');

    await user.click(screen.getByRole('button', { name: /^get coaching session.*daniel.*marta/is }));
    expect(onSelect).toHaveBeenLastCalledWith(GAMES[0]!.pgn, GAMES[0]!.playedAt, 'coach');
  });

  test('shows the given link-account prompt when the user has no linked username', () => {
    render(
      <RemoteGamePicker games={[]} isLoading={false} isLinked={false} linkPrompt="Link your Chess.com account." onSelect={vi.fn()} />
    );
    expect(screen.getByText(/link your chess\.com account/i)).toBeInTheDocument();
  });

  test('shows a loading state while fetching', () => {
    render(<RemoteGamePicker games={[]} isLoading={true} isLinked={true} linkPrompt="Link your account." onSelect={vi.fn()} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  test('shows an empty state when linked but no recent games', () => {
    render(<RemoteGamePicker games={[]} isLoading={false} isLinked={true} linkPrompt="Link your account." onSelect={vi.fn()} />);
    expect(screen.getByText(/no recent games/i)).toBeInTheDocument();
  });

  test('renders per-row extra detail via renderMeta', () => {
    const gamesWithTimeClass = GAMES.map((game) => ({ ...game, timeClass: 'rapid' }));
    render(
      <RemoteGamePicker
        games={gamesWithTimeClass}
        isLoading={false}
        isLinked={true}
        linkPrompt="Link your account."
        onSelect={vi.fn()}
        renderMeta={(game) => <span>{game.timeClass}</span>}
      />
    );
    expect(screen.getByText('rapid')).toBeInTheDocument();
  });

  describe('bulk selection (Task 31.4 bulk import)', () => {
    test('renders a checkbox per row and an "Import N games" button reflecting the selection count', () => {
      const onToggle = vi.fn();
      render(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(['abcd1234']), onToggle, onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      expect(screen.getByRole('checkbox', { name: /select daniel.*marta to import/is })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Import 1 game' })).toBeInTheDocument();
    });

    test('checking a row calls onToggle with its id, without calling onSelect', async () => {
      const onSelect = vi.fn();
      const onToggle = vi.fn();
      const user = userEvent.setup();
      render(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={onSelect}
          bulkSelection={{ selectedIds: new Set(), onToggle, onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      await user.click(screen.getByRole('checkbox'));

      expect(onToggle).toHaveBeenCalledWith('abcd1234');
      expect(onSelect).not.toHaveBeenCalled();
    });

    test('in bulk mode a tick box replaces each row\'s Analyze / Get coaching session buttons', () => {
      render(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(), onToggle: vi.fn(), onImportSelected: vi.fn(), isImporting: false }}
        />
      );

      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /analyze/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /get coaching session/i })).not.toBeInTheDocument();
    });

    test('past the selection cap an unticked row is disabled and labelled with the reason; a ticked row stays enabled', () => {
      const games = [GAMES[0]!, { ...GAMES[0]!, id: 'efgh5678', blackName: 'Bob' }];
      render(
        <RemoteGamePicker
          games={games}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{
            selectedIds: new Set(['abcd1234']),
            onToggle: vi.fn(),
            onImportSelected: vi.fn(),
            isImporting: false,
            maxSelectable: 1,
            capReason: 'You can import 1 more game right now'
          }}
        />
      );

      expect(screen.getByRole('checkbox', { name: /select daniel.*marta to import/is })).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: 'You can import 1 more game right now' })).toBeDisabled();
    });

    test('a settled importedId shows a checkmark in place of its checkbox and the button reports progress', () => {
      render(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{
            selectedIds: new Set(['abcd1234']),
            onToggle: vi.fn(),
            onImportSelected: vi.fn(),
            isImporting: true,
            importedIds: new Set(['abcd1234'])
          }}
        />
      );

      expect(screen.getByLabelText('Imported')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Importing 1 of 1…' })).toBeInTheDocument();
    });

    test('the "Import N games" button is disabled with no selection and calls onImportSelected when clicked', async () => {
      const onImportSelected = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(), onToggle: vi.fn(), onImportSelected, isImporting: false }}
        />
      );

      expect(screen.getByRole('button', { name: 'Import 0 games' })).toBeDisabled();

      rerender(
        <RemoteGamePicker
          games={GAMES}
          isLoading={false}
          isLinked={true}
          linkPrompt="Link your account."
          onSelect={vi.fn()}
          bulkSelection={{ selectedIds: new Set(['abcd1234']), onToggle: vi.fn(), onImportSelected, isImporting: false }}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Import 1 game' }));
      expect(onImportSelected).toHaveBeenCalled();
    });
  });
});
