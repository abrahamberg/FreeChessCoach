import type { EndgameStanding, EndgameStats, EndgameTheme } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { formatPercent } from './formatStat.js';
import { HeadlineStat } from './HeadlineStat.js';

export interface EndgameStatsSectionProps {
  stats: EndgameStats;
}

const STANDING_LABELS: Record<EndgameStanding, string> = {
  winning: 'From winning positions',
  equal: 'From equal positions',
  worse: 'From worse positions'
};

const THEME_LABELS: Record<EndgameTheme, string> = {
  kingAndPawn: 'King & pawn',
  queen: 'Queen',
  rookAndPawn: 'Rook & pawn',
  other: 'Other endgames'
};

/** design.md's Endgame card (Task 30.2): overall accuracy, win% by starting
 * standing, and accuracy by material theme — presentational only. Buckets
 * with zero games (already filtered out by buildStatsDashboard) simply
 * don't render a row. */
export function EndgameStatsSection({ stats }: EndgameStatsSectionProps): ReactNode {
  return (
    <section aria-label="Endgame" className="card stats-section">
      <h2>Endgame</h2>
      <div className="stats-section__headline">
        <HeadlineStat label="Overall endgame accuracy" value={formatPercent(stats.overallAccuracy)} />
      </div>

      <h3>Win % by starting standing</h3>
      {stats.byStanding.length === 0 ? (
        <p>No endgames reached yet.</p>
      ) : (
        <ul className="stats-section__stat-list">
          {stats.byStanding.map((row) => (
            <li key={row.standing}>
              <span>
                {STANDING_LABELS[row.standing]} ({row.gamesPlayed})
              </span>
              <span>{formatPercent(row.winPct)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Accuracy by theme</h3>
      {stats.byTheme.length === 0 ? (
        <p>No endgames reached yet.</p>
      ) : (
        <ul className="stats-section__stat-list">
          {stats.byTheme.map((row) => (
            <li key={row.theme}>
              <span>
                {THEME_LABELS[row.theme]} ({row.gamesPlayed})
              </span>
              <span>{formatPercent(row.accuracy)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
