import type { OpeningStats } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { formatCount, formatPercent } from './formatStat.js';
import { HeadlineStat } from './HeadlineStat.js';

export interface OpeningStatsSectionProps {
  stats: OpeningStats;
}

/** design.md's Opening Statistics card (Task 30.2): average book depth,
 * opening accuracy, mistake rate, and a per-opening performance table —
 * presentational only, all fetching lives in StatsPage. */
export function OpeningStatsSection({ stats }: OpeningStatsSectionProps): ReactNode {
  return (
    <section aria-label="Opening" className="card stats-section">
      <h2>Opening</h2>
      <div className="stats-section__headline">
        <HeadlineStat label="Avg. book moves" value={formatCount(stats.averageBookMoves)} />
        <HeadlineStat label="Opening accuracy" value={formatPercent(stats.openingAccuracy)} />
        <HeadlineStat label="Avg. opening mistakes" value={formatCount(stats.averageOpeningMistakes)} />
      </div>

      <h3>Performance by opening</h3>
      {stats.performanceByOpening.length === 0 ? (
        <p>No opening data yet.</p>
      ) : (
        <table className="stats-section__table">
          <thead>
            <tr>
              <th scope="col">Opening</th>
              <th scope="col">Games</th>
              <th scope="col">Win %</th>
              <th scope="col">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {stats.performanceByOpening.map((row) => (
              <tr key={row.opening}>
                <th scope="row">{row.opening}</th>
                <td>{row.gamesPlayed}</td>
                <td>{formatPercent(row.winPct)}</td>
                <td>{formatPercent(row.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
