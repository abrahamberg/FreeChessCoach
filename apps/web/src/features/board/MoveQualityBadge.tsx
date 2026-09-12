import type { ReactNode } from 'react';
import { MOVE_QUALITY_SYMBOLS, type MoveQuality } from '@freechesscoach/shared';
import './MoveQualityBadge.css';

export interface MoveQualityBadgeProps {
  quality: MoveQuality | undefined;
  size: 'sm' | 'md';
}

/** Chess.com-style colored circle + glyph for a move's quality tier. Shared
 * by MoveExplorer (desktop, size="md") and MoveStrip (mobile, size="sm") so
 * the badge markup/styling exists in exactly one place. Every tier gets an
 * icon — chess.com's own move list/strip marks every move, not just the
 * ones worth flagging, and Daniel's call was to match that rather than stay
 * quiet on 'good'/'excellent'. Renders nothing only when there's no quality
 * yet (a ply with no classified move). */
export function MoveQualityBadge({ quality, size }: MoveQualityBadgeProps): ReactNode {
  if (!quality) return null;
  return (
    <span className={`move-quality-badge move-quality-badge--${size} move-quality-badge--${quality}`}>
      {MOVE_QUALITY_SYMBOLS[quality]}
    </span>
  );
}
