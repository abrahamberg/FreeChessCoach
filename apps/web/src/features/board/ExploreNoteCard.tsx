import type { ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { CoachCard } from '../../components/CoachCard.js';
import { EyeIcon } from '../../components/Icon.js';
import { AlternativesPanel, hasMoveNoteText, MoveNote } from './MoveNoteContent.js';
import { MoveQualityBadge } from './MoveQualityBadge.js';
import type { ExploreFeedbackStatus } from './useExploreFeedback.js';
import './ExploreNoteCard.css';

export interface ExploreNoteCardProps {
  status: ExploreFeedbackStatus;
  evaluation: string | null;
  note: ClassifiedMoveDto | undefined;
}

/** The Explore panel sandbox's own coach box — same CoachCard shell every
 * other board view's note uses (MoveNoteCard, BotStatusPanel, PagedMessageCard),
 * but with a plain eye icon instead of a coach portrait: this is the engine
 * pipeline's own take on a sandbox move, off the record, not the coach
 * speaking. On mobile this stands in for PagedMessageCard itself — the
 * screen's one "coach box" slot — for as long as the student is exploring
 * (MobileCoachSessionBody), so it always renders a card, never null,
 * including before any move has been played; on desktop it's an addition
 * below the board (SessionBoardColumn), gated there on isExploring by the
 * caller instead. `note.quality` is never 'book' here (classifyLiveMove
 * always classifies with isBookMove: false — a sandbox move has no
 * opening-book walk of its own to check against), so unlike MoveNoteCard
 * this never needs an OpeningLabel branch. */
export function ExploreNoteCard({ status, evaluation, note }: ExploreNoteCardProps): ReactNode {
  if (!note) {
    return (
      <CoachCard avatar={<EyeIcon width={16} height={16} />} className="explore-note-card explore-note-card--empty">
        <p className="explore-note-card__prompt">
          {status === 'error'
            ? "Couldn't reach the engine — try again."
            : 'Exploring on your own, off the record — play a move and I\'ll flag it here.'}
        </p>
        {evaluation && <p className="explore-note-card__eval">{evaluation}</p>}
      </CoachCard>
    );
  }

  const quality = note.quality;

  return (
    <CoachCard avatar={<EyeIcon width={16} height={16} />} className={`explore-note-card explore-note-card--${quality}`}>
      <div className="explore-note-card__header">
        <MoveQualityBadge quality={quality} size="md" />
        <span className="explore-note-card__move">{note.moveSan}</span>
        {status === 'loading' && <span className="explore-note-card__status">updating…</span>}
      </div>
      <MoveNote move={note} />
      {!hasMoveNoteText(note) && <p className="explore-note-card__empty-text">Nothing to flag — a solid, natural move.</p>}
      <AlternativesPanel move={note} hideBestLine />
      {evaluation && <p className="explore-note-card__eval">{evaluation}</p>}
    </CoachCard>
  );
}
