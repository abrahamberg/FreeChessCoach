import type { ReactNode } from 'react';
import { IntentButtons } from './IntentButtons.js';
import type { ImportIntent } from './import-intent.js';

export interface RemoteGamePickerBulkSelection {
  selectedIds: ReadonlySet<string>;
  onToggle: (gameId: string) => void;
  onImportSelected: () => void;
  isImporting: boolean;
  /** Ids that have already settled (succeeded or failed) this run — lets a
   * row flip from checkbox to a done mark as its own request lands, instead
   * of every row staying frozen until the whole sequential batch finishes. */
  importedIds?: ReadonlySet<string>;
  /** How many rows may be ticked at once (the smallest headroom of the
   * import limits — see `selectionLimit`). Rows past it are disabled and
   * labelled with `capReason`. Omit for no cap. */
  maxSelectable?: number;
  capReason?: string | null;
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
  /** Import this one game, for the chosen intent (Analyze or Get coaching
   * session). Each row offers both buttons — except in bulk mode, where a
   * tick box replaces them. */
  onSelect: (pgn: string, playedAt: string | null, intent: ImportIntent) => void;
  /** Bulk import (Task 31.4): tick boxes and one "Import N games" button in
   * place of each row's own Analyze / Get coaching session buttons. Omit for
   * the one-game-at-a-time picker. */
  bulkSelection?: RemoteGamePickerBulkSelection;
  /** Extra per-row detail rendered between the result and the date — e.g.
   * Chess.com's time class, which Lichess's feed has no equivalent for. */
  renderMeta?: (game: TGame) => ReactNode;
}

/** A row's tick box. Past the selection cap, an unticked row is disabled and
 * its label says why (a ticked row can always be unticked). */
function RowCheckbox({ game, bulkSelection }: { game: RemoteGamePickerRow; bulkSelection: RemoteGamePickerBulkSelection }): ReactNode {
  const isSelected = bulkSelection.selectedIds.has(game.id);
  const isCapped = !isSelected && bulkSelection.selectedIds.size >= (bulkSelection.maxSelectable ?? Number.POSITIVE_INFINITY);
  const label = `Select ${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'} to import`;
  return (
    <input
      type="checkbox"
      aria-label={isCapped && bulkSelection.capReason ? bulkSelection.capReason : label}
      checked={isSelected}
      disabled={bulkSelection.isImporting || isCapped}
      onChange={() => bulkSelection.onToggle(game.id)}
    />
  );
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
          {bulkSelection.isImporting
            ? `Importing ${bulkSelection.importedIds?.size ?? 0} of ${bulkSelection.selectedIds.size}…`
            : `Import ${bulkSelection.selectedIds.size} ${bulkSelection.selectedIds.size === 1 ? 'game' : 'games'}`}
        </button>
      )}
      {bulkSelection?.isImporting && (
        <progress
          className="import-bar"
          value={bulkSelection.importedIds?.size ?? 0}
          max={bulkSelection.selectedIds.size}
          aria-label="Importing games"
        />
      )}
      <ul className="remote-game-picker">
        {games.map((game) => (
          <li key={game.id}>
            {bulkSelection && bulkSelection.selectedIds.has(game.id) && bulkSelection.importedIds?.has(game.id) ? (
              <span className="remote-game-picker__imported" aria-label="Imported" title="Imported">
                ✓
              </span>
            ) : (
              bulkSelection && <RowCheckbox game={game} bulkSelection={bulkSelection} />
            )}
            <div className="remote-game-picker__game">
              <span>
                {game.whiteName ?? '?'} vs. {game.blackName ?? '?'}
              </span>
              <span>{game.result ?? '*'}</span>
              {renderMeta?.(game)}
              {game.playedAt && <time dateTime={game.playedAt}>{new Date(game.playedAt).toLocaleDateString()}</time>}
            </div>
            {!bulkSelection && (
              <IntentButtons
                subject={`${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'}`}
                onChoose={(intent) => onSelect(game.pgn, game.playedAt, intent)}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
