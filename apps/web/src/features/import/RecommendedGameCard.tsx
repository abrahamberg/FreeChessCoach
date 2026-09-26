import { TACTIC_MOTIF_LABELS, type CoachingCandidateResponse, type ImportedGameItem } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import '../games/RailCard.css';
import '../games/CoachNudgeCard.css';
import './RecommendedGameCard.css';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { ResultBadge } from '../../components/ResultBadge.js';
import { EyeIcon, LightbulbIcon, MessageCircleIcon } from '../../components/Icon.js';
import { pickedGameLine } from '../games/coach-nudge-lines.js';
import { opponentName, gameOutcome } from '../games/gameDisplay.js';
import { useProfile } from '../../hooks/useProfile.js';

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

/** The batch's most tactical game, offered for a coaching session by the
 * student's own coach — their face beside a speech bubble, saying (in their
 * voice) that they picked it. Ranked programmatically (no AI): tactics missed
 * plus tactics allowed. */
export function RecommendedGameCard({
  game,
  candidate,
  onStartCoaching,
  onReview
}: RecommendedGameCardProps): ReactNode {
  const outcome = gameOutcome(game);
  const persona = useProfile().data?.coachPersona ?? 'general';
  // Fixed for the visit, so the line doesn't change on every render.
  const [pick] = useState(Math.random);
  return (
    <section className="recommended-game card" aria-label="Recommended game">
      <div className="recommended-game__head">
        <span className="rail-card__chip">
          <LightbulbIcon width={16} height={16} />
          Best game to coach on
        </span>
      </div>
      <div className="coach-nudge__speech">
        <CoachAvatar persona={persona} size="chat" />
        <div className="coach-nudge__bubble recommended-game__bubble">
          <p>{pickedGameLine(persona, pick)}</p>
          <p className="recommended-game__players">
            {outcome && <ResultBadge outcome={outcome} />}
            <span>vs {opponentName(game)}</span>
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
              <MessageCircleIcon width={18} height={18} />
              Start coaching session
            </button>
            <button type="button" className="btn-secondary" onClick={onReview}>
              <EyeIcon width={18} height={18} />
              Review it first
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
