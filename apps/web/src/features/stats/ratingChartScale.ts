/** Pure pixel/scale math for RatingStatsSection's SVG line chart — split out
 * so the "nice" axis-tick rounding (the fiddly part) is unit-testable
 * without rendering, and the component itself stays presentational. */

/** Fallback width before the container has been measured (and in jsdom, which
 * has no layout); the real chart is drawn 1:1 at its container's width. */
export const CHART_WIDTH = 560;
export const CHART_HEIGHT = 180;
export const CHART_MARGIN = { top: 16, right: 16, bottom: 28, left: 48 };

export const PLOT_WIDTH = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
export const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;

/** A single point (or an all-equal set of them) has no real spread to plot
 * against — fall back to a fixed window centered on that one value instead
 * of a zero-height domain. */
const FLAT_RATING_WINDOW = 200;

/** Rounds a raw axis step (span / targetTicks) up to a "nice" 1/2/5×10^n
 * step — the same convention every off-the-shelf charting library uses so
 * tick labels land on round numbers (1400, 1450, 1500…) instead of
 * arbitrary fractions. */
function niceStep(span: number, targetTicks: number): number {
  const rawStep = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  const niceResidual = residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1;
  return niceResidual * magnitude;
}

export function ratingDomain(ratings: number[]): [number, number] {
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);
  return minRating === maxRating
    ? [minRating - FLAT_RATING_WINDOW / 2, minRating + FLAT_RATING_WINDOW / 2]
    : [minRating, maxRating];
}

/** Evenly-stepped y-axis ticks fully containing `[minRating, maxRating]`,
 * rounded to a nice step. The first and last tick become the chart's actual
 * plotted domain, so the top/bottom gridlines land exactly on the plot
 * border instead of the data touching its edges. */
export function ratingTicks(minRating: number, maxRating: number, targetTicks = 4): number[] {
  const step = niceStep(Math.max(maxRating - minRating, 1), targetTicks);
  const start = Math.floor(minRating / step) * step;
  const end = Math.ceil(maxRating / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) ticks.push(Math.round(value));
  return ticks;
}

export function plotWidthFor(chartWidth: number): number {
  return Math.max(chartWidth - CHART_MARGIN.left - CHART_MARGIN.right, 1);
}

/** Games are placed by when they were played, not by their position in the
 * list: a player who imports a burst of games and then goes quiet should see
 * that on the chart, and a year of climbing must keep its true shape once old
 * games collapse into one archived point per week. */
export function xForTime(time: number, minTime: number, maxTime: number, plotWidth = PLOT_WIDTH): number {
  if (maxTime <= minTime) return CHART_MARGIN.left + plotWidth / 2;
  return CHART_MARGIN.left + ((time - minTime) / (maxTime - minTime)) * plotWidth;
}

export function yForRating(rating: number, domainMin: number, domainMax: number): number {
  const span = Math.max(domainMax - domainMin, 1);
  return CHART_MARGIN.top + PLOT_HEIGHT - ((rating - domainMin) / span) * PLOT_HEIGHT;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Caps how many x-axis date labels are drawn — one per game would overlap
 * into an unreadable smear — by spreading at most `maxTicks` evenly across
 * the time span, always including the first and last moment. */
export function xTickTimes(minTime: number, maxTime: number, maxTicks = 6): number[] {
  if (maxTime - minTime < MS_PER_DAY) return [minTime];
  const step = (maxTime - minTime) / (maxTicks - 1);
  return Array.from({ length: maxTicks }, (_, tick) => (tick === maxTicks - 1 ? maxTime : minTime + tick * step));
}
