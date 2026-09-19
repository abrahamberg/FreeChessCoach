import type { ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface BatchAnalysisProgressProps {
  /** One entry per game that imported, in import order. `game` is absent
   * until the recent-imports list has loaded (or if it could not be). */
  rows: { gameId: string; game?: ImportedGameItem }[];
}

function statusText(status: ImportedGameItem['analysisStatus'] | undefined): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Couldn’t be analyzed';
    case 'paused':
      return 'Waiting for your browser — keep this tab open';
    case 'planning':
      return 'Finishing up…';
    case 'engine_running':
      return 'Reviewing…';
    default:
      return 'Waiting to start…';
  }
}

function labelOf(game: ImportedGameItem | undefined): string {
  return game ? `${game.whiteName ?? '?'} vs. ${game.blackName ?? '?'}` : 'Imported game';
}

/** Per-game analysis progress for a just-imported batch. Presentational —
 * `BatchImportView` owns the polling. Analysis only runs while the browser
 * tab is open, hence the reminder. */
export function BatchAnalysisProgress({ rows }: BatchAnalysisProgressProps): ReactNode {
  const finished = rows.filter((row) => row.game?.analysisStatus === 'ready' || row.game?.analysisStatus === 'failed').length;
  return (
    <section className="batch-progress" aria-label="Analysis progress">
      <p className="batch-progress__summary">
        {finished} of {rows.length} analyzed{finished < rows.length ? ' — keep this tab open until they finish' : ''}
      </p>
      <ul className="batch-progress__list">
        {rows.map(({ gameId, game }) => (
          <li key={gameId} className="batch-progress__row">
            <span>{labelOf(game)}</span>
            <span className="batch-progress__status">{statusText(game?.analysisStatus)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
