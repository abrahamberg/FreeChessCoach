import type { ReactNode } from 'react';

export interface MoveCardProps {
  san: string;
  fen: string;
  /** True when the student used BoardActionBar's Hint button before playing
   * this move (PLAYER_MOVE_PATTERN's optional group) — shown as a small
   * note, mirroring how DivergedLineMessage flags an explored line. */
  usedHint?: boolean;
}

/** design.md §5.3: the student's board move rendered as a compact chat card. */
export function MoveCard({ san, usedHint }: MoveCardProps): ReactNode {
  return (
    <p className="move-card">
      You played <code className="san">{san}</code>
      {usedHint && <span className="move-card__hint-note">used a hint</span>}
    </p>
  );
}
