import type { ReactNode } from 'react';
import type { ClassifiedMoveDto, MoveQuality } from '@freechesscoach/shared';
import { AlternativesPanel, hasMoveNoteText, MoveNote, OpeningLabel } from '../board/MoveNoteContent.js';
import { MoveQualityBadge } from '../board/MoveQualityBadge.js';
import { describePly } from '../chat/positionDivider.js';
import './MoveNoteCard.css';

export interface MoveNoteCardProps {
  ply: number;
  san: string | null;
  move: ClassifiedMoveDto | undefined;
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

/** The mobile Game Review page's dominant element (chess.com's own mobile
 * review puts its coaching note above the board, not a small aside below a
 * move list — this is that, adapted to what the static Review page actually
 * has: no LLM turn, no persona, just the same pre-baked note text
 * MoveExplorer's desktop sidebar already shows, at a size and position that
 * makes it the first thing read rather than something scrolled past). */
export function MoveNoteCard({ ply, san, move }: MoveNoteCardProps): ReactNode {
  if (ply <= 0 || !san) {
    return (
      <div className="move-note-card move-note-card--empty">
        <p className="move-note-card__prompt">Tap a move below to see the coach's note.</p>
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
      </div>
      {/* Scrolls on its own (long reasons + alternatives can run past a
          screen's worth) — the header above stays put so the move/quality is
          never scrolled out of view while reading. */}
      <div className="move-note-card__body">
        {move ? (
          <>
            {move.quality === 'book' ? <OpeningLabel move={move} /> : <MoveNote move={move} />}
            {!hasMoveNoteText(move) && <p className="move-note-card__empty-text">Nothing to flag — a solid, natural move.</p>}
            <AlternativesPanel move={move} />
          </>
        ) : (
          <p className="move-note-card__empty-text">No analysis for this move.</p>
        )}
      </div>
    </div>
  );
}
