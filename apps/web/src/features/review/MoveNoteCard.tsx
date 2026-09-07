import type { ReactNode } from 'react';
import type { ClassifiedMoveDto, MoveQuality } from '@freechesscoach/shared';
import { MessageCircleIcon } from '../../components/Icon.js';
import { AlternativesPanel, hasMoveNoteText, MoveNote, OpeningLabel } from '../board/MoveNoteContent.js';
import { MoveQualityBadge } from '../board/MoveQualityBadge.js';
import { describePly } from '../chat/positionDivider.js';
import './MoveNoteCard.css';

export interface MoveNoteCardProps {
  ply: number;
  san: string | null;
  move: ClassifiedMoveDto | undefined;
  /** Omit to hide the Coach entry point entirely (already at the coach
   * tier, or analysis not ready yet) — GameReviewPage's own gating,
   * unchanged from the standalone "Continue with Coach" button this
   * replaces; just an icon now, in the note card's own header, instead of
   * a full-width bar that cost space on every visit whether wanted or
   * not. */
  onContinueWithCoach?: () => void;
  isContinuingWithCoach?: boolean;
}

/** 'good'/'excellent' get no headline, same call as MoveQualityBadge's own
 * "nothing worth flagging" — the card still shows the move itself, just
 * without a quality tag pulling focus onto a non-event. */
const QUALITY_HEADLINES: Partial<Record<MoveQuality, string>> = {
  brilliant: 'Brilliant move',
  great: 'Great move',
  best: 'Best move',
  book: 'Book move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
  forced: 'Forced move'
};

function CoachButton({ onContinueWithCoach, isContinuingWithCoach }: Pick<MoveNoteCardProps, 'onContinueWithCoach' | 'isContinuingWithCoach'>): ReactNode {
  if (!onContinueWithCoach) return null;
  return (
    <button
      type="button"
      className="move-note-card__coach-button"
      onClick={onContinueWithCoach}
      disabled={isContinuingWithCoach}
      aria-label={isContinuingWithCoach ? 'Starting coaching session…' : 'Continue with Coach'}
      title="Continue with Coach"
    >
      <MessageCircleIcon width={17} height={17} />
    </button>
  );
}

/** The Game Review page's dominant note element — chess.com's own mobile
 * review puts its coaching note above the board rather than a small aside
 * below a move list, adapted here to what the static Review page actually
 * has (no LLM turn, no persona, the same pre-baked note text MoveExplorer's
 * list already shows). Used twice: as the mobile layout's top card, and as
 * the desktop layout's right column, in the spot a coaching session's chat
 * pane would occupy — the prompt text below is deliberately neutral about
 * where "select a move" happens (a tap on the strip below on mobile, a
 * click in the list on the left on desktop). */
export function MoveNoteCard({ ply, san, move, onContinueWithCoach, isContinuingWithCoach }: MoveNoteCardProps): ReactNode {
  if (ply <= 0 || !san) {
    return (
      <div className="move-note-card move-note-card--empty">
        <div className="move-note-card__header">
          <p className="move-note-card__prompt">Select a move to see the coach's note.</p>
          <CoachButton onContinueWithCoach={onContinueWithCoach} isContinuingWithCoach={isContinuingWithCoach} />
        </div>
      </div>
    );
  }

  const { moveNumber, color } = describePly(ply);
  const moveLabel = `${moveNumber}${color === 'white' ? '.' : '…'} ${san}`;
  const quality = move?.quality;
  const headline = quality ? QUALITY_HEADLINES[quality] : undefined;

  return (
    <div className={quality ? `move-note-card move-note-card--${quality}` : 'move-note-card'}>
      <div className="move-note-card__header">
        <MoveQualityBadge quality={quality} size="md" />
        <span className="move-note-card__move">{moveLabel}</span>
        {headline && <span className="move-note-card__headline">{headline}</span>}
        <CoachButton onContinueWithCoach={onContinueWithCoach} isContinuingWithCoach={isContinuingWithCoach} />
      </div>
      {/* Scrolls on its own (long reasons + alternatives can run past a
          screen's worth) — the header above stays put so the move/quality is
          never scrolled out of view while reading. */}
      <div className="move-note-card__body">
        {move ? (
          <>
            {move.quality === 'book' ? <OpeningLabel move={move} /> : <MoveNote move={move} />}
            {!hasMoveNoteText(move) && <p className="move-note-card__empty-text">Nothing to flag — a solid, natural move.</p>}
            <AlternativesPanel move={move} hideBestLine />
          </>
        ) : (
          <p className="move-note-card__empty-text">No analysis for this move.</p>
        )}
      </div>
    </div>
  );
}
