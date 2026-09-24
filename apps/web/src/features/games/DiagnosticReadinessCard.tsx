import type { DiagnosticReadinessResponse } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './DiagnosticReadinessCard.css';

/** Games-page nudge: the coach only tracks patterns across games once the
 * user has `required` rated games in one time control. Hidden once reached. */
export function DiagnosticReadinessCard({ readiness }: { readiness: DiagnosticReadinessResponse }): ReactNode {
  if (readiness.ready) return null;
  const { ratedGames, required } = readiness;
  const remaining = required - ratedGames;

  return (
    <section className="readiness card" aria-label="Pattern tracking progress">
      <div className="readiness__header">
        <h2>Unlock pattern tracking</h2>
        <span className="readiness__count">
          {ratedGames} of {required}
        </span>
      </div>
      <progress
        className="readiness__bar"
        value={ratedGames}
        max={required}
        aria-label={`${ratedGames} of ${required} rated games imported`}
      />
      <p className="readiness__hint">
        Import {remaining} more rated {remaining === 1 ? 'game' : 'games'} with the same time control so your coach can
        spot repeating patterns and set your focus areas. Casual games and mixed time controls don't count.
      </p>
    </section>
  );
}
