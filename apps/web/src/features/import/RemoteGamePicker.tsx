import { useState, type ReactNode } from 'react';
import { IntentButtons } from './IntentButtons.js';
import type { ImportIntent } from './import-intent.js';
import { ResultBadge, type GameOutcome } from '../../components/ResultBadge.js';
import { shortDate } from '../games/gameDisplay.js';

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
  /** bullet / blitz / rapid / classical / daily. */
  timeClass?: string;
  /** Already in the student's library. */
  imported?: boolean;
}

export interface RemoteGamePickerProps<TGame extends RemoteGamePickerRow> {
  games: TGame[];
  isLoading: boolean;
  isLinked: boolean;
  linkPrompt: ReactNode;
  /** The linked account's name on this platform — tells which side is the
   * student, so a row can show the opponent and how the student did. */
  username?: string | null;
  /** Opens the username form, for "is that the right name?" on an empty list. */
  onChangeUsername?: () => void;
  /** Load-more paging: the next page of older games. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
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

const SPEED_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'classical', label: 'Classical' },
  { value: 'daily', label: 'Daily' }
];

/** Opponent + how the student did, from the student's side of the board.
 * When the name matches neither player (or none is linked) the row falls back
 * to "White vs. Black" and a neutral result. */
function summarizeGame(game: RemoteGamePickerRow, username: string | null): { title: string; outcome: GameOutcome } {
  const me = username?.toLowerCase();
  const isWhite = me !== undefined && game.whiteName?.toLowerCase() === me;
  const isBlack = me !== undefined && game.blackName?.toLowerCase() === me;
  const title = isWhite
    ? (game.blackName ?? '?')
    : isBlack
      ? (game.whiteName ?? '?')
      : `${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'}`;
  let outcome: GameOutcome = 'unknown';
  if (game.result === '1/2-1/2') outcome = 'draw';
  else if ((isWhite || isBlack) && (game.result === '1-0' || game.result === '0-1')) {
    outcome = (game.result === '1-0') === isWhite ? 'win' : 'loss';
  }
  return { title, outcome };
}

/** A row's tick box. Past the selection cap, an unticked row is disabled and
 * its label says why (a ticked row can always be unticked). */
function RowCheckbox({
  game,
  bulkSelection
}: {
  game: RemoteGamePickerRow;
  bulkSelection: RemoteGamePickerBulkSelection;
}): ReactNode {
  const isSelected = bulkSelection.selectedIds.has(game.id);
  const isCapped =
    !isSelected && bulkSelection.selectedIds.size >= (bulkSelection.maxSelectable ?? Number.POSITIVE_INFINITY);
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
  username = null,
  onChangeUsername,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onSelect,
  bulkSelection,
  renderMeta
}: RemoteGamePickerProps<TGame>): ReactNode {
  const [speed, setSpeed] = useState('all');
  if (!isLinked) {
    return <p>{linkPrompt}</p>;
  }
  if (isLoading) {
    return (
      <div className="remote-loader" role="status" aria-live="polite">
        <span className="remote-loader__spinner" aria-hidden="true" />
        <strong>Loading your recent games…</strong>
        <span>Fetching them from your account — this usually takes a few seconds.</span>
        <ul className="remote-loader__skeleton" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => (
            <li key={row} />
          ))}
        </ul>
      </div>
    );
  }
  if (games.length === 0) {
    return (
      <div className="remote-game-picker__empty">
        <p>No recent games found.</p>
        {username && onChangeUsername && (
          <p>
            Is <strong>{username}</strong> your correct username?{' '}
            <button type="button" className="btn-ghost" onClick={onChangeUsername}>
              Change
            </button>
          </p>
        )}
      </div>
    );
  }

  const visibleGames = speed === 'all' ? games : games.filter((game) => game.timeClass === speed);

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
      <div className="remote-game-picker__filter" role="group" aria-label="Time control">
        {SPEED_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={speed === value} onClick={() => setSpeed(value)}>
            {label}
          </button>
        ))}
      </div>
      {visibleGames.length === 0 && (
        <p className="remote-game-picker__none">
          No {speed} games in the {games.length} loaded so far{hasMore ? ' — load more to look further back.' : '.'}
        </p>
      )}
      <ul className="remote-game-picker">
        {visibleGames.map((game) => {
          const summary = summarizeGame(game, username);
          const isDone = bulkSelection?.selectedIds.has(game.id) && bulkSelection.importedIds?.has(game.id);
          return (
            <li key={game.id} className={game.imported ? 'remote-game-picker__row--imported' : undefined}>
              <span className="remote-game-picker__select">
                {isDone || game.imported ? (
                  <span
                    className="remote-game-picker__imported"
                    aria-label={isDone ? 'Imported' : 'Already imported'}
                    title={isDone ? 'Imported' : 'Already imported'}
                  >
                    ✓
                  </span>
                ) : (
                  bulkSelection && <RowCheckbox game={game} bulkSelection={bulkSelection} />
                )}
              </span>
              <ResultBadge outcome={summary.outcome} />
              <div className="remote-game-picker__game">
                <span className="remote-game-picker__opponent">{summary.title}</span>
                <span className="remote-game-picker__meta">
                  {game.timeClass && game.timeClass !== 'unknown' && (
                    <span className="remote-game-picker__speed">{game.timeClass}</span>
                  )}
                  {renderMeta?.(game)}
                  {game.imported && <span className="remote-game-picker__badge">Imported</span>}
                  {game.playedAt && <time dateTime={game.playedAt}>{shortDate(game.playedAt)}</time>}
                </span>
              </div>
              <IntentButtons
                disabled={bulkSelection?.isImporting}
                subject={`${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'}`}
                onChoose={(intent) => onSelect(game.pgn, game.playedAt, intent)}
              />
            </li>
          );
        })}
      </ul>
      {hasMore && onLoadMore && (
        <button
          type="button"
          className="btn-secondary remote-game-picker__more"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          {isLoadingMore && <span className="remote-loader__spinner" aria-hidden="true" />}
          {isLoadingMore ? 'Loading more games…' : 'Load more games'}
        </button>
      )}
    </div>
  );
}
