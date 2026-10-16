import { seriesLabel, type CourseSeries, type PublicCourseResponse } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ChevronRightIcon } from '../../../components/Icon.js';

export interface SeriesNavProps {
  series: CourseSeries;
  /** The lessons around this one; absent in the editor's preview, which links nowhere. */
  neighbours?: PublicCourseResponse['seriesNeighbours'];
}

/** "Chess From Zero, lesson 7 of 14" under the course's header, with the
 * lessons before and after it in the series. */
export function SeriesNav({ series, neighbours }: SeriesNavProps): ReactNode {
  const { previous, next } = neighbours ?? { previous: null, next: null };
  return (
    <nav className="series-nav" aria-label="Series">
      <span className="series-nav__where">
        {seriesLabel(series)}
        {series.module && <span className="meta"> · {series.module}</span>}
      </span>
      {previous && (
        <Link to={`/learn/${encodeURIComponent(previous.slug)}`} className="series-nav__link" rel="prev">
          <ArrowLeftIcon width={14} height={14} />
          <span className="series-nav__title">{previous.title}</span>
        </Link>
      )}
      {next && (
        <Link to={`/learn/${encodeURIComponent(next.slug)}`} className="series-nav__link series-nav__link--next" rel="next">
          <span className="series-nav__title">{next.title}</span>
          <ChevronRightIcon width={14} height={14} />
        </Link>
      )}
    </nav>
  );
}
