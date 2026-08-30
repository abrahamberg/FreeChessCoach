import type { OpeningStats } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { formatCount, formatPercent } from './formatStat.js';
import { HeadlineStat } from './HeadlineStat.js';

export interface OpeningStatsSectionProps {
  stats: OpeningStats;
}

/** Keeps the card's height stable once a user has played enough distinct
 * openings for the table to grow unbounded — the rest are one click away
 * via "Show all" (rows are already sorted by games-played descending, so
 * the visible slice is always the most-relevant openings). */
const VISIBLE_COUNT = 5;

/** design.md's Opening Statistics card (Task 30.2): average book depth,
 * opening accuracy, mistake rate, and a per-opening performance table —
 * presentational only, all fetching lives in StatsPage. */
export function OpeningStatsSection({ stats }: OpeningStatsSectionProps): ReactNode {
  const [showAll, setShowAll] = useState(false);
  const visibleRows = showAll ? stats.performanceByOpening : stats.performanceByOpening.slice(0, VISIBLE_COUNT);

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
        <>
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
              {visibleRows.map((row) => (
                <tr key={row.opening}>
                  <th scope="row">{row.opening}</th>
                  <td>{row.gamesPlayed}</td>
                  <td>{formatPercent(row.winPct)}</td>
                  <td>{formatPercent(row.accuracy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.performanceByOpening.length > VISIBLE_COUNT && (
            <button type="button" className="btn-ghost stats-section__show-more" onClick={() => setShowAll((current) => !current)}>
              {showAll ? 'Show fewer' : `Show all ${stats.performanceByOpening.length}`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
