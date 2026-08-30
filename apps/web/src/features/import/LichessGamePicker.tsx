import type { LichessRecentGame } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface LichessGamePickerBulkSelection {
  selectedIds: ReadonlySet<string>;
  onToggle: (gameId: string) => void;
  onImportSelected: () => void;
  isImporting: boolean;
}

export interface LichessGamePickerProps {
  games: LichessRecentGame[];
  isLoading: boolean;
  isLinked: boolean;
  onSelect: (pgn: string) => void;
  /** Stat-bank bulk import (Task 31.4) — additive to the single-click
   * `onSelect` contract above, which is unaffected: a row's button always
   * imports it immediately regardless of whether this is set. Omit to keep
   * today's picker exactly as it was. */
  bulkSelection?: LichessGamePickerBulkSelection;
}

/** design.md §4.2: "From Lichess" picker — same row format as the games list,
 * tap to select. No fetching here (AGENTS.md rule 7) — ImportPage owns it. */
export function LichessGamePicker({ games, isLoading, isLinked, onSelect, bulkSelection }: LichessGamePickerProps): ReactNode {
  if (!isLinked) {
    return <p>Link your Lichess account in Settings to import from Lichess.</p>;
  }
  if (isLoading) {
    return <p>Loading your recent games…</p>;
  }
  if (games.length === 0) {
    return <p>No recent games found.</p>;
  }

  return (
    <div className="lichess-game-picker-container">
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
      <ul className="lichess-game-picker">
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
              {game.playedAt && <time dateTime={game.playedAt}>{new Date(game.playedAt).toLocaleDateString()}</time>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
