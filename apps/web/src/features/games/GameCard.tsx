import type { ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { EyeIcon, MessageCircleIcon } from '../../components/Icon.js';
import { ResultBadge } from '../../components/ResultBadge.js';
import { DeleteGameButton } from './DeleteGameButton.js';
import {
  opponentName,
  gameOutcome,
  shortDate,
  sourceIconFor,
  sourceLabelFor,
  statusAndActionFor
} from './gameDisplay.js';
import './GameCard.css';
import './RailCard.css';

export interface GameCardProps {
  game: ImportedGameItem;
  onSelect: (gameId: string) => void;
  onReview: (gameId: string) => void;
  onCoach: (gameId: string) => void;
  onAnalyze: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

/** A compact card for the "Recently imported" rail. Too small for labelled
 * buttons, so Review / Coach / Delete are icon buttons — each with a
 * tooltip (`title`) and an accessible name. A game that isn't ready yet
 * shows its status badge and its one contextual action instead. */
export function GameCard({ game, onSelect, onReview, onCoach, onAnalyze, onDelete }: GameCardProps): ReactNode {
  const status = statusAndActionFor(game);
  const outcome = gameOutcome(game);
  const SourceIcon = sourceIconFor(game.source);
  const date = game.playedAt ?? game.createdAt;

  return (
    <div className="card rail-card game-card">
      <div className="rail-card__top">
        {outcome && <ResultBadge outcome={outcome} />}
        <span className="rail-card__title game-card__players">{opponentName(game)}</span>
      </div>

      <span className="rail-card__meta">
        <span
          className="game-card__source"
          title={`From ${sourceLabelFor(game.source)}`}
          role="img"
          aria-label={`From ${sourceLabelFor(game.source)}`}
        >
          <SourceIcon width={14} height={14} />
        </span>
        <time dateTime={date}>{shortDate(date)}</time>
        {game.estimatedRating !== null && (
          <span title="Your estimated rating in this game">&middot; ~{game.estimatedRating}</span>
        )}
      </span>

      <div className="rail-card__actions">
        <span
          className={
            status.statusVariant === 'neutral'
              ? 'badge game-card__status'
              : `badge badge--${status.statusVariant} game-card__status`
          }
          data-animate={status.animateStatus ? 'true' : undefined}
        >
          {status.statusLabel}
        </span>
        {status.actionKind === 'reviewCoach' ? (
          <>
            <button
              type="button"
              className="game-card__icon-action"
              title="Review"
              aria-label="Review"
              onClick={() => onReview(game.id)}
            >
              <EyeIcon width={16} height={16} />
            </button>
            <button
              type="button"
              className="game-card__icon-action game-card__icon-action--primary"
              title="Coach"
              aria-label="Coach"
              onClick={() => onCoach(game.id)}
            >
              <MessageCircleIcon width={16} height={16} />
            </button>
          </>
        ) : (
          <>
            {status.actionLabel && (
              <button
                type="button"
                className="btn-primary game-card__text-action"
                onClick={() => (status.actionKind === 'analyze' ? onAnalyze(game.id) : onSelect(game.id))}
              >
                {status.actionLabel}
              </button>
            )}
          </>
        )}
        <span className="game-card__spacer" />
        <DeleteGameButton game={game} onDelete={onDelete} />
      </div>
    </div>
  );
}
