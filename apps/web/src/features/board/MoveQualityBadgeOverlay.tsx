import type { ReactNode } from 'react';
import './MoveQualityBadgeOverlay.css';

export interface MoveQualityBadgeOverlayProps {
  /** The square the move landed on (its destination) — the badge pins to
   * this square's corner regardless of board orientation. */
  square: string;
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

/** A small "good move" checkmark pinned to the square the current ply's
 * move landed on — board-only and transient, per Daniel's call: it's
 * recomputed from the current ply's move on every render (see
 * useGameReviewPageData), never written into `move.reasons` or shown in
 * the move list/ledger (MoveQualityBadge already covers that, and
 * deliberately skips 'good' — this fills that one gap only on the board
 * itself, for the position currently on screen). */
export function MoveQualityBadgeOverlay({ square, orientation }: MoveQualityBadgeOverlayProps): ReactNode {
  const column = columnFor(square, orientation);
  const row = rowFor(square, orientation);
  return (
    <div className="move-quality-badge-overlay" style={{ left: `${column * 12.5}%`, top: `${row * 12.5}%` }} aria-hidden="true">
      <span className="move-quality-badge-overlay__icon">✓</span>
    </div>
  );
}
