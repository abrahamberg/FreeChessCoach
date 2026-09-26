import type { GameListItem } from '@freechesscoach/shared';
import type { ComponentType, ReactNode } from 'react';
import {
  BoardIcon,
  CheckIcon,
  MessageCircleIcon,
  PlayCircleIcon,
  PlaySmallIcon,
  type IconProps
} from '../../components/Icon.js';
import { useConfirmDialog } from '../../hooks/useConfirmDialog.js';
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
  /** Coaching cards only: end the session (the game counts as coached). */
  onFinish: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

type SessionKind = 'coaching' | 'coach_play' | 'vs_bot';

const KIND: Record<SessionKind, { label: string; Icon: ComponentType<IconProps>; started: string }> = {
  coaching: { label: 'Coaching on your game', Icon: MessageCircleIcon, started: 'Coaching since' },
  coach_play: { label: 'Game vs coach', Icon: PlayCircleIcon, started: 'Started' },
  vs_bot: { label: 'Bot game', Icon: BoardIcon, started: 'Started' }
};

function kindOf(game: GameListItem): SessionKind {
  if (game.source === 'coach_play') return 'coach_play';
  if (game.coaching === 'in_progress') return 'coaching';
  return 'vs_bot';
}

/** A compact "Continue" card: an open session — coaching on one of the
 * student's games, a live game against the coach, or a game against a bot —
 * small enough that several sit side by side on the Continue rail. The type
 * chip (own icon and colour for coaching) says which it is; then who the
 * game was against, when the session started, and icon buttons (Continue;
 * for coaching, Finish coaching; and the red trash can, which confirms
 * before abandoning and deleting the game). */
export function ContinueSessionCard({ game, onContinue, onFinish, onDelete }: ContinueSessionCardProps): ReactNode {
  const kind = kindOf(game);
  const { confirm, dialog } = useConfirmDialog();
  const { label, Icon, started } = KIND[kind];
  const opponent = opponentName(game);
  const startedAt = game.sessionStartedAt ?? game.createdAt;

  return (
    <div className="card rail-card continue-session-card">
      <div className="rail-card__top">
        <span
          className={kind === 'coaching' ? 'rail-card__chip rail-card__chip--coaching' : 'rail-card__chip'}
          title={label}
        >
          <Icon width={16} height={16} />
          {label}
        </span>
      </div>
      <span className="rail-card__title" title={opponent}>
        vs {opponent}
      </span>
      <span className="rail-card__meta">
        <time dateTime={startedAt}>
          {started} {shortDate(startedAt)}
        </time>
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
        {kind === 'coaching' && (
          <button
            type="button"
            className="game-card__icon-action"
            title="Finish coaching"
            aria-label={`Finish coaching: ${opponent}`}
            onClick={() =>
              confirm(
                {
                  title: 'Finish this coaching session?',
                  description:
                    'The game is marked as coached and leaves Continue. The chat is kept — Coach on this game reopens it.',
                  confirmLabel: 'Finish coaching'
                },
                () => onFinish(game.id)
              )
            }
          >
            <CheckIcon width={16} height={16} />
          </button>
        )}
        <DeleteGameButton game={game} onDelete={onDelete} />
      </div>
      {dialog}
    </div>
  );
}
