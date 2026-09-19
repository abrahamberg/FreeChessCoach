import type { ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { EyeIcon, MessageCircleIcon } from '../../components/Icon.js';
import { DeleteGameButton } from './DeleteGameButton.js';
import { sourceLabelFor, statusAndActionFor, userSideResult } from './gameDisplay.js';
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
  const result = userSideResult(game);
  const date = game.playedAt ?? game.createdAt;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];
  const userIsWhite = game.userColor === 'white';

  return (
    <div className="card rail-card game-card">
      <div className="rail-card__top">
        <span className="rail-card__title game-card__players">
          <span className={userIsWhite ? 'game-card__you' : undefined}>{whiteName}</span>
          <span className="game-card__vs">vs</span>
          <span className={!userIsWhite ? 'game-card__you' : undefined}>{blackName}</span>
        </span>
        {result && (
          <span className={`badge game-card__result game-card__result--${result.label}`} title={result.label}>
            {result.symbol}
          </span>
        )}
      </div>

      <span className="rail-card__meta">
        {sourceLabelFor(game.source)}
        <span aria-hidden="true">&middot;</span>
        <time dateTime={date}>{new Date(date).toLocaleDateString()}</time>
        {game.timeControl && <span>&middot; {game.timeControl}</span>}
        {game.estimatedRating !== null && <span>&middot; ~{game.estimatedRating}</span>}
      </span>

      <div className="rail-card__actions">
        {status.actionKind === 'reviewCoach' ? (
          <>
            <button type="button" className="game-card__icon-action" title="Review" aria-label="Review" onClick={() => onReview(game.id)}>
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
            <span
              className={
                status.statusVariant === 'neutral' ? 'badge game-card__status' : `badge badge--${status.statusVariant} game-card__status`
              }
              data-animate={status.animateStatus ? 'true' : undefined}
            >
              {status.statusLabel}
            </span>
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
