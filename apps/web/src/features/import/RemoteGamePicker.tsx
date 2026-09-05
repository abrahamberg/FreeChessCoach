import type { ReactNode } from 'react';

export interface RemoteGamePickerBulkSelection {
  selectedIds: ReadonlySet<string>;
  onToggle: (gameId: string) => void;
  onImportSelected: () => void;
  isImporting: boolean;
}

export interface RemoteGamePickerRow {
  id: string;
  pgn: string;
  whiteName: string | null;
  blackName: string | null;
  result: string | null;
  playedAt: string | null;
}

export interface RemoteGamePickerProps<TGame extends RemoteGamePickerRow> {
  games: TGame[];
  isLoading: boolean;
  isLinked: boolean;
  linkPrompt: ReactNode;
  onSelect: (pgn: string) => void;
  /** Stat-bank bulk import (Task 31.4) — additive to the single-click
   * `onSelect` contract above, which is unaffected: a row's button always
   * imports it immediately regardless of whether this is set. Omit to keep
   * today's picker exactly as it was. */
  bulkSelection?: RemoteGamePickerBulkSelection;
  /** Extra per-row detail rendered between the result and the date — e.g.
   * Chess.com's time class, which Lichess's feed has no equivalent for. */
  renderMeta?: (game: TGame) => ReactNode;
}

/** design.md §4.2 / Task 51.6: shared "From Lichess" / "From Chess.com" picker
 * — same row format as the games list, tap to select. No fetching here
 * (AGENTS.md rule 7) — ImportPage owns it. */
export function RemoteGamePicker<TGame extends RemoteGamePickerRow>({
  games,
  isLoading,
  isLinked,
  linkPrompt,
  onSelect,
  bulkSelection,
  renderMeta
}: RemoteGamePickerProps<TGame>): ReactNode {
  if (!isLinked) {
    return <p>{linkPrompt}</p>;
  }
  if (isLoading) {
    return <p>Loading your recent games…</p>;
  }
  if (games.length === 0) {
    return <p>No recent games found.</p>;
  }

  return (
    <div className="remote-game-picker-container">
      {bulkSelection && (
        <button
          type="button"
          className="btn-primary"
          disabled={bulkSelection.selectedIds.size === 0 || bulkSelection.isImporting}
          onClick={bulkSelection.onImportSelected}
        >
          {bulkSelection.isImporting ? 'Importing…' : `Import ${bulkSelection.selectedIds.size} for stat bank`}
        </button>
      )}
      <ul className="remote-game-picker">
        {games.map((game) => (
          <li key={game.id}>
            {bulkSelection && (
              <input
                type="checkbox"
                aria-label={`Select ${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'} for stat bank import`}
                checked={bulkSelection.selectedIds.has(game.id)}
                onChange={() => bulkSelection.onToggle(game.id)}
              />
            )}
            <button type="button" onClick={() => onSelect(game.pgn)}>
              <span>
                {game.whiteName ?? '?'} vs. {game.blackName ?? '?'}
              </span>
              <span>{game.result ?? '*'}</span>
              {renderMeta?.(game)}
              {game.playedAt && <time dateTime={game.playedAt}>{new Date(game.playedAt).toLocaleDateString()}</time>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
