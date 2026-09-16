import type { ChesscomRecentGame, LichessRecentGame } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RemoteGamePicker, type RemoteGamePickerBulkSelection } from './RemoteGamePicker.js';

export type RemoteTab = 'lichess' | 'chesscom';

interface RemoteSourceState<TGame> {
  games: TGame[];
  isLoading: boolean;
  isLinked: boolean;
}

/** Canonical shape of a completed stat-bank bulk import — owned here (the
 * presentational side) so ImportPage's mutation result type and this panel's
 * prop type can't drift apart into two hand-written duplicates. */
export interface BulkResult {
  succeeded: number;
  total: number;
  rateLimited: boolean;
}

export interface RemoteImportPanelProps {
  tab: RemoteTab;
  statBankMode: boolean;
  onStatBankModeChange: (enabled: boolean) => void;
  lichess: RemoteSourceState<LichessRecentGame>;
  chesscom: RemoteSourceState<ChesscomRecentGame>;
  onSelect: (pgn: string) => void;
  bulkSelection: RemoteGamePickerBulkSelection;
  bulkResult?: BulkResult;
}

/** The "From Lichess" / "From Chess.com" tab contents: the stat-bank bulk-import
 * toggle (Task 31.4) plus whichever picker matches `tab`, both wired to the same
 * bulk-selection state since only one remote tab is ever active at once.
 * ImportPage owns the data fetching and passes it down (AGENTS.md rule 7). */
export function RemoteImportPanel({
  tab,
  statBankMode,
  onStatBankModeChange,
  lichess,
  chesscom,
  onSelect,
  bulkSelection,
  bulkResult
}: RemoteImportPanelProps): ReactNode {
  return (
    <>
      <label className="import-page__stat-bank-toggle">
        <input type="checkbox" checked={statBankMode} onChange={(event) => onStatBankModeChange(event.target.checked)} />
        Bulk import for stat bank
      </label>
      {tab === 'lichess' ? (
        <RemoteGamePicker
          games={lichess.games}
          isLoading={lichess.isLoading}
          isLinked={lichess.isLinked}
          linkPrompt="Link your Lichess account in Settings to import from Lichess."
          onSelect={onSelect}
          bulkSelection={statBankMode ? bulkSelection : undefined}
        />
      ) : (
        <RemoteGamePicker
          games={chesscom.games}
          isLoading={chesscom.isLoading}
          isLinked={chesscom.isLinked}
          linkPrompt="Link your Chess.com account in Settings to import from Chess.com."
          onSelect={onSelect}
          bulkSelection={statBankMode ? bulkSelection : undefined}
          renderMeta={(game) => <span>{game.timeClass}</span>}
        />
      )}
      {bulkResult && bulkResult.succeeded < bulkResult.total && (
        <p className="import-page__bulk-result">
          Imported {bulkResult.succeeded} of {bulkResult.total} games for your stat bank.
          {bulkResult.rateLimited && ' Daily import limit reached (10 games/day).'} <Link to="/games">Go to Games</Link>
        </p>
      )}
    </>
  );
}
