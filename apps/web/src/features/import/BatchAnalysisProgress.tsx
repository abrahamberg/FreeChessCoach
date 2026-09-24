import type { ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { AnalysisProgress } from './AnalysisProgress.js';
import './BatchAnalysisProgress.css';

export interface BatchAnalysisProgressProps {
  /** One entry per game that imported, in import order. `game` is absent
   * until the recent-imports list has loaded (or if it could not be). */
  rows: { gameId: string; game?: ImportedGameItem }[];
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function statusText(status: ImportedGameItem['analysisStatus'] | undefined): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Couldn’t be analyzed';
    case 'paused':
      return 'Waiting for your browser — keep this tab open';
    case 'planning':
      return 'Finding tactics and building the report…';
    case 'engine_running':
      return 'Reviewing…';
    default:
      return 'Waiting to start…';
  }
}

function labelOf(game: ImportedGameItem | undefined): string {
  return game ? `${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'}` : 'Imported game';
}

/** Per-game analysis progress for a just-imported batch: the single-game
 * board loader, once per game, with the game's name on top. The list
 * endpoint carries a status but no position count or FEN, so each board
 * fills by phase (engine wave, then the tactics wave on the last rank, then
 * fully lit) on the starting position rather than by exact percent.
 * Presentational — `BatchImportView` owns the polling. Analysis only runs
 * while the browser tab is open, hence the reminder. */
export function BatchAnalysisProgress({ rows }: BatchAnalysisProgressProps): ReactNode {
  const finished = rows.filter((row) => row.game?.analysisStatus === 'ready' || row.game?.analysisStatus === 'failed').length;
  return (
    <section className="batch-progress" aria-label="Analysis progress">
      <p className="batch-progress__summary">
        {finished} of {rows.length} analyzed{finished < rows.length ? ' — keep this tab open until they finish' : ''}
      </p>
      <progress className="import-bar" value={finished} max={rows.length} aria-label={`${finished} of ${rows.length} games analyzed`} />
      <ul className="batch-progress__grid">
        {rows.map(({ gameId, game }) => (
          <li key={gameId} className="batch-progress__card">
            <h2 className="batch-progress__name">{labelOf(game)}</h2>
            <AnalysisProgress status={game?.analysisStatus ?? null} finalFen={START_FEN} showTips={false} />
            <p className="batch-progress__status">{statusText(game?.analysisStatus)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
