import type { ReactNode } from 'react';
import { TACTIC_MOTIF_LABELS, type ClassifiedMoveDto } from '@freechesscoach/shared';
import './TacticMotifBadge.css';

export interface TacticMotifBadgeProps {
  move: Pick<ClassifiedMoveDto, 'tacticOpportunity' | 'tacticPrevention'>;
}

/** Per-ply markers for the move list — the same "found N of M"/"prevented
 * N of M" data TacticsStatsSection shows aggregated across a whole game,
 * here surfaced on the one ply it happened: a tactic the engine's best move
 * embodied at this position (found it, or missed it), and/or an opponent's
 * tactic reachable right before this move (defused it, or didn't). Renders
 * nothing when neither field is set — most plies aren't tactical. */
export function TacticMotifBadge({ move }: TacticMotifBadgeProps): ReactNode {
  const { tacticOpportunity, tacticPrevention } = move;
  if (!tacticOpportunity && !tacticPrevention) return null;

  return (
    <span className="tactic-motif-badge">
      {tacticOpportunity && (
        <span
          className={`tactic-motif-badge__icon tactic-motif-badge__icon--${tacticOpportunity.found ? 'hit' : 'miss'}`}
          title={`${TACTIC_MOTIF_LABELS[tacticOpportunity.type]}: ${tacticOpportunity.found ? 'found' : 'available, not played'}${detailSuffix(tacticOpportunity.detail)}`}
        >
          ⚡
        </span>
      )}
      {tacticPrevention && (
        <span
          className={`tactic-motif-badge__icon tactic-motif-badge__icon--${tacticPrevention.prevented ? 'hit' : 'miss'}`}
          title={`Opponent's ${TACTIC_MOTIF_LABELS[tacticPrevention.type]}: ${tacticPrevention.prevented ? 'defused' : 'not defused'}${detailSuffix(tacticPrevention.detail)}`}
        >
          🛡
        </span>
      )}
    </span>
  );
}

/** `null`/absent (a report predating per-claim detail, or a type with no
 * detector-specific shape) shows no extra clause — the type/found label
 * above still reads fine on its own. */
function detailSuffix(detail: string | null | undefined): string {
  return detail ? ` — ${detail}` : '';
}
