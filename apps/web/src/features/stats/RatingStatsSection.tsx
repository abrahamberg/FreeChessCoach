import type { RatingStats } from '@freechesscoach/shared';
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_WIDTH,
  PLOT_HEIGHT,
  plotWidthFor,
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
    <section aria-label="Estimated rating" className="card stats-section stats-section--wide">
      <h2>
        Estimated rating ({stats.gamesWithEstimate} {stats.gamesWithEstimate === 1 ? 'game' : 'games'})
      </h2>

      {points.length === 0 ? (
        <p>Not enough analyzed games yet for a rating estimate.</p>
      ) : (
        <RatingChart points={points} />
      )}
    </section>
  );
}

/** The chart is full-width, so it is drawn 1:1 at its container's measured
 * width — a fixed viewBox would balloon in height (and shrink its labels on
 * phones) as the width changed. */
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(CHART_WIDTH);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      if (element.clientWidth > 0) setWidth(element.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

function RatingChart({ points }: { points: RatingStats['points'] }): ReactNode {
  const [containerRef, chartWidth] = useElementWidth<HTMLDivElement>();
  const plotWidth = plotWidthFor(chartWidth);
  const [domainMin, domainMax] = ratingDomain(points.map((point) => point.estimatedRating));
  const yTicks = ratingTicks(domainMin, domainMax);
  const plotDomainMin = yTicks[0]!;
  const plotDomainMax = yTicks.at(-1)!;
  const yFor = (rating: number) => yForRating(rating, plotDomainMin, plotDomainMax);
  const linePoints = points.map((point, index) => `${xFor(index, points.length, plotWidth)},${yFor(point.estimatedRating)}`).join(' ');

  return (
    <div ref={containerRef} className="rating-chart-container">
      <svg
        className="rating-chart"
        width={chartWidth}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
        role="img"
        aria-label={`Estimated rating across ${points.length} game${points.length === 1 ? '' : 's'}, from ${points[0]!.estimatedRating} to ${points.at(-1)!.estimatedRating}`}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              className="rating-chart__gridline"
              x1={CHART_MARGIN.left}
              x2={CHART_MARGIN.left + plotWidth}
              y1={yFor(tick)}
              y2={yFor(tick)}
            />
            <text className="rating-chart__y-label" x={CHART_MARGIN.left - 8} y={yFor(tick)} textAnchor="end" dominantBaseline="middle">
              {tick}
            </text>
          </g>
        ))}

        <rect className="rating-chart__border" x={CHART_MARGIN.left} y={CHART_MARGIN.top} width={plotWidth} height={PLOT_HEIGHT} fill="none" />

        {points.length > 1 && <polyline className="rating-chart__line" fill="none" points={linePoints} />}

        {points.map((point, index) => (
          <circle
            key={`${point.playedAt}-${index}`}
            className="rating-chart__point"
            cx={xFor(index, points.length, plotWidth)}
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
            x={xFor(index, points.length, plotWidth)}
            y={CHART_MARGIN.top + PLOT_HEIGHT + 18}
            textAnchor="middle"
          >
            {formatDate(points[index]!.playedAt)}
          </text>
        ))}

      </svg>
    </div>
  );
}
