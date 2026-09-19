import type { GameListItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { MessageCircleIcon, PlayCircleIcon } from '../../components/Icon.js';
import { DeleteGameButton } from './DeleteGameButton.js';
import './ContinueSessionCard.css';
import './RailCard.css';

export interface ContinueSessionCardProps {
  /** Must have a live `sessionId` — the Continue rail is fed from
   * GET /api/games/in-progress, which only returns these, so this never has
   * to fall back to anything else. */
  game: GameListItem;
  onContinue: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

const TYPE_LABEL: Record<'coach_play' | 'vs_bot', string> = {
  coach_play: 'Coaching session',
  vs_bot: 'Bot game'
};

/** A compact "Continue" card: an in-progress play session (live coaching, or
 * a game against a bot) — small enough that several sit side by side on the
 * Continue rail. The red trash can (confirmed) abandons and deletes the
 * game. */
export function ContinueSessionCard({ game, onContinue, onDelete }: ContinueSessionCardProps): ReactNode {
  const isCoach = game.source === 'coach_play';
  const Icon = isCoach ? MessageCircleIcon : PlayCircleIcon;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];

  return (
    <div className="card rail-card continue-session-card">
      <div className="rail-card__top">
        <Icon width={18} height={18} className="rail-card__icon" />
        <span className="rail-card__label">{TYPE_LABEL[isCoach ? 'coach_play' : 'vs_bot']}</span>
        <DeleteGameButton game={game} onDelete={onDelete} />
      </div>
      <span className="rail-card__title">
        {whiteName} vs {blackName}
      </span>
      <div className="rail-card__actions">
        <button type="button" className="btn-primary" onClick={() => onContinue(game.id)}>
          Continue
        </button>
      </div>
    </div>
  );
}
