import type { ReactNode } from 'react';
import { EqualsIcon, MinusIcon, PlusIcon } from './Icon.js';
import './ResultBadge.css';

export type GameOutcome = 'win' | 'loss' | 'draw' | 'unknown';

const OUTCOMES = {
  win: { Icon: PlusIcon, label: 'Win' },
  loss: { Icon: MinusIcon, label: 'Loss' },
  draw: { Icon: EqualsIcon, label: 'Draw' },
  unknown: { Icon: null, label: 'Result unknown' }
} as const;

/** How the student did in a game: a rounded square with + (win, green),
 * − (loss, red) or = (draw, grey) — the scoring shorthand chess sites use, and
 * nothing that reads as an analysis status. The label is the tooltip and the
 * accessible name. */
export function ResultBadge({ outcome }: { outcome: GameOutcome }): ReactNode {
  const { Icon, label } = OUTCOMES[outcome];
  return (
    <span className={`result-badge result-badge--${outcome}`} title={label} role="img" aria-label={label}>
      {Icon ? <Icon width={16} height={16} strokeWidth={2.75} /> : <span aria-hidden="true">·</span>}
    </span>
  );
}
