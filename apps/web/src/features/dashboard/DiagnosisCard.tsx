import {
  CONFIDENCE_LEVEL_LABELS,
  SCOPE_TAG_LABELS,
  type DiagnosisCodeId,
  type DiagnosisEntryResponse,
  type EmittableConfidenceLevel
} from '@freechesscoach/shared';
import type { ReactNode } from 'react';

export interface DiagnosisCardProps {
  entry: DiagnosisEntryResponse;
  onViewEvidence: (code: DiagnosisCodeId, label: string) => void;
}

const CONFIDENCE_BADGE_VARIANT: Record<EmittableConfidenceLevel, string> = {
  probable: 'badge--primary',
  signal: 'badge--info',
  insufficient: 'badge--warning'
};

/** Task 58.2: the code-level counterpart to `FocusAreaCard` — `E/O`,
 * confidence and scope for one catalog diagnosis, plus any data-quality
 * caveats fired against the live window (`get_diagnostic_profile`'s own
 * "name the caveat if you rely on it anyway" standard, surfaced here too
 * rather than silently dropped). Reuses `FocusAreaCard`'s `.focus-area-card`
 * styling — same card-in-a-list shape, just a different data axis. */
export function DiagnosisCard({ entry, onViewEvidence }: DiagnosisCardProps): ReactNode {
  const failurePercent = Math.round(entry.failureRate * 100);
  return (
    <div className="focus-area-card">
      <span className={`badge ${CONFIDENCE_BADGE_VARIANT[entry.confidence]} focus-area-card__trend`}>
        {CONFIDENCE_LEVEL_LABELS[entry.confidence]}
      </span>
      <h3>{entry.label}</h3>
      <p>
        {entry.episodes}/{entry.opportunities} failed ({failurePercent}%) &middot;{' '}
        {entry.scopeTags.map((tag) => SCOPE_TAG_LABELS[tag]).join(', ')}
      </p>
      {entry.firedGates.length > 0 && (
        <p className="focus-area-card__meta">
          Caveat: {entry.firedGates.map((gate) => gate.label).join(' ')}
        </p>
      )}
      <p className="focus-area-card__meta">
        <button
          type="button"
          className="focus-area-card__evidence-link"
          onClick={() => onViewEvidence(entry.code, entry.label)}
        >
          View evidence
        </button>
      </p>
    </div>
  );
}
