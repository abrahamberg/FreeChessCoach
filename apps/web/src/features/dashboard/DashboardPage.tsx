import { DashboardResponseSchema, DIAGNOSIS_CODES_BY_ID, type DiagnosisCodeId, type MistakeCategory } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../api/client.js';
import { TrendingUpIcon } from '../../components/Icon.js';
import { CATEGORY_LABELS } from './categoryLabels.js';
import { DiagnosisCard } from './DiagnosisCard.js';
import { EvidenceModal } from './EvidenceModal.js';
import { FocusAreaCard } from './FocusAreaCard.js';
import { PracticeCard } from './PracticeCard.js';
import { SessionHistory } from './SessionHistory.js';
import { TrendChart, type TrendRange } from './TrendChart.js';
import { useDiagnostics } from './useDiagnostics.js';
import './DashboardPage.css';

interface EvidenceTarget {
  code: DiagnosisCodeId;
  label: string;
}

/** design.md §4.3: Progress dashboard — focus areas, code-level diagnoses,
 * mistake trends, session history. Owns fetching (AGENTS.md rule 7); every
 * child is presentational. */
export function DashboardPage(): ReactNode {
  const navigate = useNavigate();
  const [range, setRange] = useState<TrendRange>('last20');
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [evidenceTarget, setEvidenceTarget] = useState<EvidenceTarget | null>(null);

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => apiGet('/api/users/me/dashboard', DashboardResponseSchema, signal)
  });
  const diagnosticsQuery = useDiagnostics();

  if (dashboardQuery.isLoading) return <p>Loading…</p>;
  if (dashboardQuery.isError || !dashboardQuery.data) return <p>Could not load your progress.</p>;

  const { focusAreas, mistakeTrends, sessionHistory } = dashboardQuery.data;
  const weeklyFocus = focusAreas.active[0] ?? null;
  const diagnosisEntries = diagnosticsQuery.data?.entries ?? [];

  /** design.md §4.3: tapping a bar drills into that category's diagnoses —
   * `entries` is already ranked confidence-then-episodes (Task 58.1), so the
   * first entry whose catalog `parentCategory` matches is the most relevant
   * one; a category with no code-level data yet (still `dialogue`-only, or
   * simply unmeasured) has nothing to drill into. */
  function handleBarClick(category: MistakeCategory): void {
    const entry = diagnosisEntries.find((e) => DIAGNOSIS_CODES_BY_ID.get(e.code)?.parentCategory === category);
    if (entry) setEvidenceTarget({ code: entry.code, label: entry.label });
  }

  return (
    <div className="page dashboard-page">
      <header className="dashboard-page__header">
        <h1>Progress</h1>
        <p className="dashboard-page__description">See what to work on and how it's trending.</p>
      </header>

      {weeklyFocus && (
        <section aria-label="This week's focus" className="card dashboard-page__hero">
          <svg
            className="dashboard-page__hero-decoration"
            width="220"
            height="140"
            viewBox="0 0 220 140"
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="10 110 55 80 90 95 130 55 165 65 205 25" opacity={0.5} />
            <polyline points="10 130 55 118 90 122 130 100 165 105 205 78" opacity={0.25} />
          </svg>
          <div className="dashboard-page__hero-body">
            <span className="dashboard-page__hero-eyebrow">
              <TrendingUpIcon width={13} height={13} strokeWidth={2.4} />
              This week's focus
            </span>
            <h2>{CATEGORY_LABELS[weeklyFocus.category]}</h2>
            <p>{weeklyFocus.note}</p>
          </div>
        </section>
      )}

      <PracticeCard />

      <section aria-label="Focus areas" className="card">
        <h2>Focus areas</h2>
        {focusAreas.active.length === 0 ? (
          <p>No focus areas yet — they'll appear as the coach spots patterns.</p>
        ) : (
          focusAreas.active.map((area) => (
            <FocusAreaCard
              key={area.diagnosisCode ?? area.category}
              area={area}
              onViewEvidence={(code, label) => setEvidenceTarget({ code, label })}
            />
          ))
        )}
        {focusAreas.resolved.length > 0 && (
          <div className="dashboard-page__resolved">
            <button type="button" onClick={() => setResolvedOpen((open) => !open)}>
              Resolved ✓ ({focusAreas.resolved.length})
            </button>
            {resolvedOpen &&
              focusAreas.resolved.map((area) => (
                <FocusAreaCard
                  key={area.diagnosisCode ?? area.category}
                  area={area}
                  onViewEvidence={(code, label) => setEvidenceTarget({ code, label })}
                />
              ))}
          </div>
        )}
      </section>

      {diagnosisEntries.length > 0 && (
        <section aria-label="Diagnoses" className="card">
          <h2>Measured diagnoses</h2>
          {diagnosisEntries.map((entry) => (
            <DiagnosisCard
              key={entry.code}
              entry={entry}
              onViewEvidence={(code, label) => setEvidenceTarget({ code, label })}
            />
          ))}
        </section>
      )}

      <section aria-label="Mistake trends" className="card">
        <h2>Trend</h2>
        <TrendChart trends={mistakeTrends} range={range} onRangeChange={setRange} onBarClick={handleBarClick} />
      </section>

      <section aria-label="Session history" className="card">
        <h2>Recent lessons</h2>
        <SessionHistory sessions={sessionHistory} onSelect={(sessionId) => navigate(`/session/${sessionId}`)} />
      </section>

      {evidenceTarget && (
        <EvidenceModal
          code={evidenceTarget.code}
          label={evidenceTarget.label}
          onClose={() => setEvidenceTarget(null)}
        />
      )}
    </div>
  );
}
