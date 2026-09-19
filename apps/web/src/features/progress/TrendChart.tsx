import type { MistakeCategory, MistakeTrend } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CATEGORY_LABELS } from './categoryLabels.js';

export type TrendRange = 'last5' | 'last20';

export interface TrendChartProps {
  trends: MistakeTrend[];
  range: TrendRange;
  onRangeChange: (range: TrendRange) => void;
  onBarClick: (category: MistakeCategory) => void;
}

/** design-improvements.md §3.5: a horizontal ranked bar per category (never
 * rotated/clipped vertical labels), last-5/last-20 toggle, tap a bar to see
 * its findings. No color-coded good/bad — just the count. Sorted so the
 * category needing the most attention reads first. */
export function TrendChart({ trends, range, onRangeChange, onBarClick }: TrendChartProps): ReactNode {
  const maxCount = Math.max(1, ...trends.map((trend) => trend[range]));
  const ranked = [...trends].sort((a, b) => b[range] - a[range]);

  return (
    <div className="trend-chart">
      <div className="trend-chart__toggle" role="group" aria-label="Range">
        <button type="button" aria-pressed={range === 'last5'} onClick={() => onRangeChange('last5')}>
          Last 5
        </button>
        <button type="button" aria-pressed={range === 'last20'} onClick={() => onRangeChange('last20')}>
          Last 20
        </button>
      </div>
      {trends.length === 0 ? (
        <p>No mistakes recorded yet.</p>
      ) : (
        <div className="trend-chart__bars">
          {ranked.map((trend) => {
            const count = trend[range];
            return (
              <button
                key={trend.category}
                type="button"
                className="trend-chart__row"
                aria-label={`${CATEGORY_LABELS[trend.category]}: ${count}`}
                onClick={() => onBarClick(trend.category)}
              >
                <span className="trend-chart__row-label">{CATEGORY_LABELS[trend.category]}</span>
                <span className="trend-chart__row-track">
                  <span className="trend-chart__row-bar" style={{ width: `${(count / maxCount) * 100}%` }} />
                </span>
                <span className="trend-chart__row-count">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
