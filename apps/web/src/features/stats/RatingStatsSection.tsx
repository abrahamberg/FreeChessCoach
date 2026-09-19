import type { RatingStats } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { HeadlineStat } from './HeadlineStat.js';
import {
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_WIDTH,
  PLOT_HEIGHT,
  PLOT_WIDTH,
  ratingDomain,
  ratingTicks,
  xFor,
  xTickIndices,
  yForRating
} from './ratingChartScale.js';

export interface RatingStatsSectionProps {
  stats: RatingStats;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** docs/algorith.md §8's estimated-rating trend: one point per game, in the
 * order it was actually played, connected into a line — deliberately not a
 * day/period average (a day with several games gets several points). The
 * Stats page's existing range/speed toggles already decide which games feed
 * this, so there's no filter state here. Presentational only; axis/scale
 * math lives in ratingChartScale.ts. */
export function RatingStatsSection({ stats }: RatingStatsSectionProps): ReactNode {
  const { points } = stats;

  return (
    <section aria-label="Estimated rating" className="card stats-section">
      <h2>Estimated rating</h2>
      <div className="stats-section__headline">
        <HeadlineStat label="Games with an estimate" value={stats.gamesWithEstimate.toString()} />
      </div>

      {points.length === 0 ? (
        <p>Not enough analyzed games yet for a rating estimate.</p>
      ) : (
        <RatingChart points={points} />
      )}
    </section>
  );
}

function RatingChart({ points }: { points: RatingStats['points'] }): ReactNode {
  const [domainMin, domainMax] = ratingDomain(points.map((point) => point.estimatedRating));
  const yTicks = ratingTicks(domainMin, domainMax);
  const plotDomainMin = yTicks[0]!;
  const plotDomainMax = yTicks.at(-1)!;
  const yFor = (rating: number) => yForRating(rating, plotDomainMin, plotDomainMax);
  const linePoints = points.map((point, index) => `${xFor(index, points.length)},${yFor(point.estimatedRating)}`).join(' ');

  return (
    <svg
      className="rating-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={`Estimated rating across ${points.length} game${points.length === 1 ? '' : 's'}, from ${points[0]!.estimatedRating} to ${points.at(-1)!.estimatedRating}`}
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            className="rating-chart__gridline"
            x1={CHART_MARGIN.left}
            x2={CHART_MARGIN.left + PLOT_WIDTH}
            y1={yFor(tick)}
            y2={yFor(tick)}
          />
          <text className="rating-chart__y-label" x={CHART_MARGIN.left - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle">
            {tick}
          </text>
        </g>
      ))}

      <rect className="rating-chart__border" x={CHART_MARGIN.left} y={CHART_MARGIN.top} width={PLOT_WIDTH} height={PLOT_HEIGHT} fill="none" />

      {points.length > 1 && <polyline className="rating-chart__line" fill="none" points={linePoints} />}

      {points.map((point, index) => (
        <circle
          key={`${point.playedAt}-${index}`}
          className="rating-chart__point"
          cx={xFor(index, points.length)}
          cy={yFor(point.estimatedRating)}
          r={3}
        >
          <title>{`${formatDate(point.playedAt)}: ${point.estimatedRating}`}</title>
        </circle>
      ))}

      {xTickIndices(points.length).map((index) => (
        <text
          key={index}
          className="rating-chart__x-label"
          x={xFor(index, points.length)}
          y={CHART_MARGIN.top + PLOT_HEIGHT + 18}
          textAnchor="middle"
        >
          {formatDate(points[index]!.playedAt)}
        </text>
      ))}
    </svg>
  );
}
