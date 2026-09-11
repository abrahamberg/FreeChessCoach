import type { ReactNode } from 'react';
import { MOVE_QUALITY_SYMBOLS, type MoveQuality } from '@freechesscoach/shared';
import './MoveQualityBadgeOverlay.css';

export interface MoveQualityBadgeOverlayProps {
  /** The square the move landed on (its destination) — the badge pins to
   * this square's corner regardless of board orientation. */
  square: string;
  quality: MoveQuality;
  orientation: 'white' | 'black';
}

function fileIndex(square: string): number {
  return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

function rankIndex(square: string): number {
  return Number(square[1]) - 1;
}

function columnFor(square: string, orientation: 'white' | 'black'): number {
  const file = fileIndex(square);
  return orientation === 'white' ? file : 7 - file;
}

function rowFor(square: string, orientation: 'white' | 'black'): number {
  const rank = rankIndex(square);
  return orientation === 'white' ? 7 - rank : rank;
}

/** A small colored quality badge pinned to the square the current ply's
 * move landed on — chess.com's own on-board move-classification icon
 * (star/checkmark/exclamation directly on the piece), not just the move
 * list's pill. Board-only and transient: recomputed from the current ply's
 * move on every render (see useGameReviewPageData), never written into
 * `move.reasons` or shown in the move list/ledger — MoveQualityBadge
 * already covers the list, this is the same tier's icon repeated on the
 * board itself, for the position currently on screen. */
export function MoveQualityBadgeOverlay({ square, quality, orientation }: MoveQualityBadgeOverlayProps): ReactNode {
  const column = columnFor(square, orientation);
  const row = rowFor(square, orientation);
  return (
    <div className="move-quality-badge-overlay" style={{ left: `${column * 12.5}%`, top: `${row * 12.5}%` }} aria-hidden="true">
      <span className={`move-quality-badge-overlay__icon move-quality-badge-overlay__icon--${quality}`}>
        {MOVE_QUALITY_SYMBOLS[quality]}
      </span>
    </div>
  );
}
