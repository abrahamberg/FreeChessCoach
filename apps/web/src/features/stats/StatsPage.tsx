import { StatsDashboardSchema, type GameSpeedFilter, type StatsDashboard, type StatsRange } from '@freechesscoach/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { apiGet } from '../../api/client.js';
import { EndgameStatsSection } from './EndgameStatsSection.js';
import { OpeningStatsSection } from './OpeningStatsSection.js';
import { StrategyStatsSection } from './StrategyStatsSection.js';
import { TacticsStatsSection } from './TacticsStatsSection.js';
import './StatsPage.css';

const RANGE_TABS: { value: StatsRange; label: string }[] = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last365', label: 'Last year' },
  { value: 'all', label: 'All time' }
];

/** Owns the range/speed query params so a tab click re-fetches with the new
 * filter — same "controlled tab drives the query key" shape as
 * DashboardPage's TrendChart range state. */
function useStatsDashboard(range: StatsRange, speed: GameSpeedFilter): UseQueryResult<StatsDashboard> {
  return useQuery({
    queryKey: ['stats', range, speed],
    queryFn: ({ signal }) => apiGet(`/api/users/me/stats?range=${range}&speed=${speed}`, StatsDashboardSchema, signal)
  });
}

/** Historical stats dashboard (Phase 30): a chess.com-style Insights page
 * aggregating every analyzed game. Owns fetching (AGENTS.md rule 7); each
 * section component (Task 30.2) is presentational. */
export function StatsPage(): ReactNode {
  const [range, setRange] = useState<StatsRange>('all');
  const [speed, setSpeed] = useState<GameSpeedFilter>('rapid');

  const statsQuery = useStatsDashboard(range, speed);

  const filters = (
    <div className="stats-page__filters">
      <div className="stats-page__toggle" role="group" aria-label="Time range">
        {RANGE_TABS.map((tab) => (
          <button key={tab.value} type="button" aria-pressed={range === tab.value} onClick={() => setRange(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="stats-page__toggle" role="group" aria-label="Game speed">
        <button type="button" aria-pressed={speed === 'rapid'} onClick={() => setSpeed('rapid')}>
          Rapid
        </button>
        <button type="button" aria-pressed={speed === 'all'} onClick={() => setSpeed('all')}>
          All formats
        </button>
      </div>
    </div>
  );

  return (
    <div className="page stats-page">
      <header className="stats-page__header">
        <h1>Stats</h1>
        <p className="stats-page__description">See how you're actually playing, across every analyzed game.</p>
      </header>

      {filters}

      {statsQuery.isLoading && <p>Loading…</p>}
      {!statsQuery.isLoading && (statsQuery.isError || !statsQuery.data) && <p>Could not load your stats.</p>}
      {statsQuery.data?.gamesAnalyzed === 0 && <p className="stats-page__empty">Analyze some games to see your stats.</p>}
      {statsQuery.data && statsQuery.data.gamesAnalyzed > 0 && (
        <div className="stats-page__sections">
          <OpeningStatsSection stats={statsQuery.data.opening} />
          <TacticsStatsSection motifs={statsQuery.data.tactics} />
          <StrategyStatsSection stats={statsQuery.data.strategy} />
          <EndgameStatsSection stats={statsQuery.data.endgame} />
        </div>
      )}
    </div>
  );
}
