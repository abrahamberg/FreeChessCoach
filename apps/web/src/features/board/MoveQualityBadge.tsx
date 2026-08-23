import type { ReactNode } from 'react';
import { MOVE_QUALITY_SYMBOLS, type MoveQuality } from '@freechesscoach/shared';
import './MoveQualityBadge.css';

export interface MoveQualityBadgeProps {
  quality: MoveQuality | undefined;
  size: 'sm' | 'md';
}

/** Chess.com-style colored circle + glyph for a move's quality tier. Shared
 * by MoveExplorer (desktop, size="md") and MoveStrip (mobile, size="sm") so
 * the badge markup/styling exists in exactly one place. Renders nothing for
 * 'good', 'excellent', or undefined — per Daniel's call, only tiers actually
 * worth flagging get an icon; a merely-fine move (excellent included) just
 * reads as plain move text. */
export function MoveQualityBadge({ quality, size }: MoveQualityBadgeProps): ReactNode {
  if (!quality || quality === 'good' || quality === 'excellent') return null;
  return (
    <span className={`move-quality-badge move-quality-badge--${size} move-quality-badge--${quality}`}>
      {MOVE_QUALITY_SYMBOLS[quality]}
    </span>
  );
}
