import type { GameListItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { MessageCircleIcon, PlayCircleIcon, PlaySmallIcon } from '../../components/Icon.js';
import { DeleteGameButton } from './DeleteGameButton.js';
import { opponentName, shortDate } from './gameDisplay.js';
import './GameCard.css';
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
 * Continue rail. Laid out like the Recently imported cards: who you play, a
 * short date, an "In progress" tag, and icon buttons (Continue, and the red
 * trash can, which confirms before abandoning and deleting the game). */
export function ContinueSessionCard({ game, onContinue, onDelete }: ContinueSessionCardProps): ReactNode {
  const isCoach = game.source === 'coach_play';
  const Icon = isCoach ? MessageCircleIcon : PlayCircleIcon;
  const label = TYPE_LABEL[isCoach ? 'coach_play' : 'vs_bot'];
  const opponent = opponentName(game);

  return (
    <div className="card rail-card continue-session-card">
      <div className="rail-card__top">
        <span className="rail-card__chip" title={label}>
          <Icon width={16} height={16} />
          {label}
        </span>
      </div>
      <span className="rail-card__title" title={opponent}>
        vs {opponent}
      </span>
      <span className="rail-card__meta">
        <time dateTime={game.createdAt}>Started {shortDate(game.createdAt)}</time>
      </span>
      <div className="rail-card__actions">
        <span className="badge badge--primary game-card__status">In progress</span>
        <span className="game-card__spacer" />
        <button
          type="button"
          className="game-card__icon-action game-card__icon-action--primary"
          title="Continue"
          aria-label={`Continue: ${label} against ${opponent}`}
          onClick={() => onContinue(game.id)}
        >
          <PlaySmallIcon width={16} height={16} />
        </button>
        <DeleteGameButton game={game} onDelete={onDelete} />
      </div>
    </div>
  );
}
