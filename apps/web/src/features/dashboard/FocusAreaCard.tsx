import type { FocusAreaSummary } from '@freechesscoach/shared';
import type { ComponentType, ReactNode } from 'react';
import { ArrowRightIcon, CheckIcon, type IconProps, TrendingUpIcon } from '../../components/Icon.js';
import { CATEGORY_LABELS } from './categoryLabels.js';

export interface FocusAreaCardProps {
  area: FocusAreaSummary;
}

const TREND_ICON: Record<FocusAreaSummary['status'], ComponentType<IconProps>> = {
  improving: TrendingUpIcon,
  active: ArrowRightIcon,
  resolved: CheckIcon
};

const TREND_LABEL: Record<FocusAreaSummary['status'], string> = {
  improving: 'Improving',
  active: 'Needs attention',
  resolved: 'Resolved'
};

const TREND_BADGE_VARIANT: Record<FocusAreaSummary['status'], string> = {
  improving: 'badge--primary',
  active: 'badge--warning',
  resolved: 'badge--success'
};

/** design-improvements.md §3.5: focus-area card — category in plain words,
 * coach note, a trend badge (word + icon, never a glyph alone —
 * accessibility §8: never communicate status by color/glyph alone), evidence
 * count. */
export function FocusAreaCard({ area }: FocusAreaCardProps): ReactNode {
  const TrendIcon = TREND_ICON[area.status];
  return (
    <div className="focus-area-card">
      <span className={`badge ${TREND_BADGE_VARIANT[area.status]} focus-area-card__trend`}>
        {TREND_LABEL[area.status]}
        <TrendIcon width={11} height={11} strokeWidth={2.75} />
      </span>
      <h3>{CATEGORY_LABELS[area.category]}</h3>
      <p>{area.note}</p>
      <p className="focus-area-card__meta">
        {area.evidenceCount} pieces of evidence &middot;{' '}
        {/* No findings-detail view exists yet (see DashboardPage's handleBarClick) — a no-op for now. */}
        <button type="button" className="focus-area-card__evidence-link">
          View evidence
        </button>
      </p>
    </div>
  );
}
