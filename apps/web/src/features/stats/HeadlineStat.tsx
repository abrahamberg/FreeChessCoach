import type { ReactNode } from 'react';

export interface HeadlineStatProps {
  label: string;
  value: string;
}

/** One boxed number+caption, reused by every stats section's headline row
 * (same shape as GameReportSummary's own headline card, generalized since
 * these sections aren't per-colour). */
export function HeadlineStat({ label, value }: HeadlineStatProps): ReactNode {
  return (
    <div className="stats-section__headline-stat">
      <span className="stats-section__headline-value">{value}</span>
      <span className="stats-section__headline-caption">{label}</span>
    </div>
  );
}
