import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { MoveNote } from '../../board/MoveNoteContent.js';
import { MoveQualityBadge } from '../../board/MoveQualityBadge.js';
import { isAcceptedAlternative } from './course-steps.js';

export type Judgement = { status: 'checking' } | { status: 'ready'; move: ClassifiedMoveDto } | { status: 'error' };

/** A move the learner tried that is not the course's. */
export interface Attempt {
  fenBefore: string;
  fenAfter: string;
  san: string;
}

export interface AttemptFeedbackProps {
  attempt: Attempt;
  judgement: Judgement | null;
  answerSan: string;
  acceptLabel: string;
  onAccept: () => void;
  onRetry: () => void;
  /** Offered next to "Try again" after a weaker move (the drill). */
  onReveal?: () => void;
}

/** §11: the move-quality label and the checked tactic sentence; a move about
 * as good as the course's is accepted without penalty. */
export function AttemptFeedback({ attempt, judgement, answerSan, acceptLabel, onAccept, onRetry, onReveal }: AttemptFeedbackProps): ReactNode {
  if (!judgement || judgement.status === 'checking') return <p className="meta" role="status">Checking {attempt.san}…</p>;
  if (judgement.status === 'error') {
    return (
      <div className="course-player__quiz">
        <p>{attempt.san} is not the course move.</p>
        <div className="course-player__actions">
          <button type="button" className="btn-primary" onClick={onRetry}>
            Try again
          </button>
          {onReveal && (
            <button type="button" className="btn-secondary" onClick={onReveal}>
              Show the move
            </button>
          )}
        </div>
      </div>
    );
  }
  const { move } = judgement;
  const accepted = isAcceptedAlternative(move.quality);
  return (
    <div className="course-player__quiz">
      <p className="course-player__verdict">
        <MoveQualityBadge quality={move.quality} size="md" /> {attempt.san}: {accepted ? `good move too; the course plays ${answerSan}.` : move.quality}
      </p>
      {!accepted && <MoveNote move={move} />}
      <div className="course-player__actions">
        {accepted ? (
          <button type="button" className="btn-primary" onClick={onAccept}>
            {acceptLabel}
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary" onClick={onRetry}>
              Try again
            </button>
            {onReveal && (
              <button type="button" className="btn-secondary" onClick={onReveal}>
                Show the move
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
