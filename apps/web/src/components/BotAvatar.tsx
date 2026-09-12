import type { CSSProperties, ReactNode } from 'react';
import './BotAvatar.css';

export type BotAvatarSize = 'picker' | 'panel' | 'grid' | 'card';

export interface BotAvatarProps {
  avatarIndex: number;
  size?: BotAvatarSize;
}

const AVATAR_COLUMNS = 6;
const AVATAR_ROWS = 5;

/** Per-row framing correction: the source sheet's rows aren't framed
 * consistently — rows 1-3 sit a bit lower in their cell than row 0 (faces
 * shift "down"), while row 4 crops tight against the top with a lot of
 * empty space below the chin ("too far up"). Every row uses the *same*
 * small zoom, so faces stay a consistent size across the whole roster —
 * only `centerY` (0=cell top, 1=cell bottom) varies per row, re-centering
 * that shared crop on each row's actual eye-line. A first attempt gave each
 * row its own (much larger) zoom to fully re-center every row, but that
 * made faces visibly different sizes tier to tier ("some too zoomed"), so
 * `centerY` here is clamped to what a single mild zoom can reach without
 * bleeding into a neighboring row — a smaller, consistent nudge rather than
 * perfect centering. */
const FRAMING_ZOOM = 1.15;
const ROW_CENTER_Y: Record<number, number> = {
  1: 0.44,
  2: 0.44,
  3: 0.45,
  4: 0.435
};

/** Returns the CSS background-size/-position needed to center a `zoom`x
 * crop of one cell (out of `count` equal cells along an axis) at `centerFrac`
 * (0-1) of that cell, expressed as percentages compatible with the classic
 * "N-cell sprite sheet" background-size/-position technique. Reduces to the
 * plain `i / (count - 1) * 100%` formula when zoom is 1. */
function axisCrop(index: number, count: number, zoom: number, centerFrac: number): { size: number; position: number } {
  const size = count * zoom * 100;
  const denominator = 1 - 1 / (count * zoom);
  const position = denominator === 0 ? 0 : (((index + centerFrac - 1 / (2 * zoom)) / count) / denominator) * 100;
  return { size, position };
}

/** Renders one portrait from the 6-column by 5-row bot sprite sheet
 * (public/brand/bots.png). Unlike CoachAvatar's hand-tuned per-persona
 * crop, this sheet is a uniform grid, so the CSS background-position is
 * computed straight from the index — only the small per-row `ROW_FRAMING`
 * correction above is hand-tuned. */
export function BotAvatar({ avatarIndex, size = 'panel' }: BotAvatarProps): ReactNode {
  const col = avatarIndex % AVATAR_COLUMNS;
  const row = Math.floor(avatarIndex / AVATAR_COLUMNS) % AVATAR_ROWS;
  const centerY = ROW_CENTER_Y[row] ?? 0.5;

  const x = axisCrop(col, AVATAR_COLUMNS, FRAMING_ZOOM, 0.5);
  const y = axisCrop(row, AVATAR_ROWS, FRAMING_ZOOM, centerY);

  const style = {
    '--bot-avatar-size-x': `${x.size}%`,
    '--bot-avatar-size-y': `${y.size}%`,
    '--bot-avatar-x': `${x.position}%`,
    '--bot-avatar-y': `${y.position}%`
  } as CSSProperties;

  return (
    <span
      className={`bot-avatar-image bot-avatar-image--${size}`}
      data-testid="bot-avatar"
      aria-hidden="true"
      style={style}
    />
  );
}
