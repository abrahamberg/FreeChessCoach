import { TACTIC_MOTIF_LABELS, type CoachingCandidateResponse, type ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Candidate = NonNullable<CoachingCandidateResponse['candidate']>;

export interface RecommendedGameCardProps {
  game: ImportedGameItem;
  candidate: Candidate;
  onStartCoaching: () => void;
  onReview: () => void;
}

/** "Fork — missed 3, allowed 1": why this game, in the reader's terms. */
function reasonOf(row: Candidate['topMotifs'][number]): string {
  const parts = [row.missed > 0 && `missed ${row.missed}`, row.allowed > 0 && `allowed ${row.allowed}`].filter(Boolean);
  return `${TACTIC_MOTIF_LABELS[row.motif]} — ${parts.join(', ')}`;
}

/** The batch's most tactical game, offered for a coaching session. Ranked
 * programmatically (no AI): tactics missed plus tactics allowed. */
export function RecommendedGameCard({ game, candidate, onStartCoaching, onReview }: RecommendedGameCardProps): ReactNode {
  return (
    <section className="recommended-game card" aria-label="Recommended game">
      <h2>Best game to coach on</h2>
      <p className="recommended-game__players">
        {game.whiteName ?? '?'} vs. {game.blackName ?? '?'} <span>{game.result ?? '*'}</span>
      </p>
      {candidate.topMotifs.length > 0 && (
        <ul className="recommended-game__reasons">
          {candidate.topMotifs.map((row) => (
            <li key={row.motif}>{reasonOf(row)}</li>
          ))}
        </ul>
      )}
      <div className="recommended-game__actions">
        <button type="button" className="btn-primary" onClick={onStartCoaching}>
          Start coaching session
        </button>
        <button type="button" className="btn-secondary" onClick={onReview}>
          Review it first
        </button>
        <Link to="/games">Go to my games</Link>
      </div>
    </section>
  );
}
