import type { StrategyStats } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { formatPercent } from './formatStat.js';
import { HeadlineStat } from './HeadlineStat.js';

export interface StrategyStatsSectionProps {
  stats: StrategyStats;
}

/** design.md's Strategy card (Task 30.2): overall strategic accuracy plus
 * the five named sub-scores (Phase 25) — presentational only. */
export function StrategyStatsSection({ stats }: StrategyStatsSectionProps): ReactNode {
  return (
    <section aria-label="Strategy" className="card stats-section">
      <h2>Strategy</h2>
      <div className="stats-section__headline">
        <HeadlineStat label="Overall strategic accuracy" value={formatPercent(stats.overall)} />
      </div>
      <ul className="stats-section__stat-list">
        <li>
          <span>Pawn structure accuracy</span>
          <span>{formatPercent(stats.pawnStructure)}</span>
        </li>
        <li>
          <span>Space advantage accuracy</span>
          <span>{formatPercent(stats.spaceAdvantage)}</span>
        </li>
        <li>
          <span>Active piece accuracy</span>
          <span>{formatPercent(stats.activePiece)}</span>
        </li>
        <li>
          <span>Attacking accuracy</span>
          <span>{formatPercent(stats.attacking)}</span>
        </li>
        <li>
          <span>Defending accuracy</span>
          <span>{formatPercent(stats.defending)}</span>
        </li>
      </ul>
    </section>
  );
}
