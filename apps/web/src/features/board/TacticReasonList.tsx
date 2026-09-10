import type { ReactNode } from 'react';
import { tacticOpportunityReason, tacticPreventionReason } from '@freechesscoach/chess-analysis';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { hasTacticVisual, type TacticSelectionKey } from './tacticSelection.js';
import { CloseIcon } from '../../components/Icon.js';
import './TacticReasonList.css';

export interface TacticReasonListProps {
  move: ClassifiedMoveDto;
  selection: TacticSelectionKey;
  onToggle: (key: Exclude<TacticSelectionKey, null>) => void;
}

interface ReasonItemProps {
  text: string;
  good: boolean;
  clickable: boolean;
  active: boolean;
  onClick: () => void;
}

/** One tactic sentence — plain text when it has no board geometry to show
 * (an older stored report, or a motif whose claim carries no geometry
 * has nothing detector-specific to draw for), otherwise a toggle button:
 * click to show its arrow on the board in green (good outcome — found it,
 * defused it) or red (missed it, left it in play), click again (or the ×
 * that appears once active) to hide it. */
function TacticReasonItem({ text, good, clickable, active, onClick }: ReasonItemProps): ReactNode {
  const toneClass = good ? 'tactic-reason-item--good' : 'tactic-reason-item--bad';
  if (!clickable) {
    return <p className={`tactic-reason-item tactic-reason-item--static ${toneClass}`}>{text}</p>;
  }
  return (
    <button
      type="button"
      className={`tactic-reason-item ${toneClass}${active ? ' tactic-reason-item--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      title={active ? 'Hide this tactic on the board' : 'Show this tactic on the board'}
    >
      <span>{text}</span>
      {active && <CloseIcon className="tactic-reason-item__close" width={14} height={14} />}
    </button>
  );
}

/** Game Review's two tactic sentences ("the opponent's threat", "the
 * tactic the engine's best move embodied") rendered as clickable items
 * instead of plain list text — clicking one draws its arrow(s) on the
 * board (useGameReviewPageData → tacticSelectionOverlay); switching to the
 * other sentence, or navigating to a different move, replaces/clears it.
 * A "show tactic arrows" toggle underneath draws both at once when there's
 * more than one to show. Renders nothing for a move with neither field
 * set (most plies aren't tactical). */
export function TacticReasonList({ move, selection, onToggle }: TacticReasonListProps): ReactNode {
  // `isUserMove` decides "You" vs "They" and lives on the move rather than
  // on either card, so a report stored before the voice rewrite renders in
  // the right voice too.
  const preventionText = move.tacticPrevention
    ? tacticPreventionReason({ ...move.tacticPrevention, isUserMove: move.isUserMove })
    : null;
  const opportunityText = move.tacticOpportunity
    ? tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove: move.isUserMove }, move.bestMoveSan)
    : null;
  if (!preventionText && !opportunityText) return null;

  return (
    <div className="tactic-reason-list">
      {preventionText && move.tacticPrevention && (
        <TacticReasonItem
          text={preventionText}
          good={move.tacticPrevention.prevented}
          clickable={Boolean(move.tacticPrevention.visual)}
          // 'all' (the "show tactic arrows" toggle) draws this one's arrow
          // too, so it reads as active right alongside the other sentence —
          // unless it has nothing to draw, matching the board's own state.
          active={selection === 'prevention' || (selection === 'all' && Boolean(move.tacticPrevention.visual))}
          onClick={() => onToggle('prevention')}
        />
      )}
      {opportunityText && move.tacticOpportunity && (
        <TacticReasonItem
          text={opportunityText}
          good={move.tacticOpportunity.found}
          clickable={Boolean(move.tacticOpportunity.visual)}
          active={selection === 'opportunity' || (selection === 'all' && Boolean(move.tacticOpportunity.visual))}
          onClick={() => onToggle('opportunity')}
        />
      )}
      {hasTacticVisual(move) && (
        <button
          type="button"
          className={`tactic-reason-list__toggle-all${selection === 'all' ? ' tactic-reason-list__toggle-all--active' : ''}`}
          onClick={() => onToggle('all')}
          aria-pressed={selection === 'all'}
        >
          {selection === 'all' ? 'Hide tactic arrows' : 'Show tactic arrows'}
        </button>
      )}
    </div>
  );
}

/** Which of `move.reasons` are just the baked-in copies of the two tactic
 * sentences above — MoveNoteContent's plain-text list filters these out
 * (via reference equality with the same pure builders) so the interactive
 * items above are the only place they're shown, not duplicated below them. */
export function tacticReasonTexts(move: ClassifiedMoveDto): Set<string> {
  const texts = new Set<string>();
  if (move.tacticPrevention) texts.add(tacticPreventionReason({ ...move.tacticPrevention, isUserMove: move.isUserMove }));
  if (move.tacticOpportunity) {
    texts.add(tacticOpportunityReason({ ...move.tacticOpportunity, isUserMove: move.isUserMove }, move.bestMoveSan));
  }
  return texts;
}
