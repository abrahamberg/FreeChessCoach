import type { GameListItem, ImportedGameItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { CalendarIcon, EyeIcon, MessageCircleIcon } from '../../components/Icon.js';
import { OverflowMenu } from '../../components/OverflowMenu.js';
import { DeleteGameButton } from './DeleteGameButton.js';
import { sourceLabelFor, statusAndActionFor, userSideResult } from './gameDisplay.js';
import './GameRow.css';

export interface GameRowProps {
  /** An imported-list item also carries `estimatedRating`, shown in the meta line. */
  game: GameListItem | ImportedGameItem;
  /** The row's one single action for every status except a ready analysis
   * (an in-progress play session's "Continue") — see `onReview`/`onCoach`
   * for the ready case, which always offers both rather than one or the
   * other. */
  onSelect: (gameId: string) => void;
  /** Opens the static Review page — offered on every ready game regardless
   * of source or how many times it's been opened before; there is no tier
   * to "use up" by reviewing. */
  onReview: (gameId: string) => void;
  /** Starts (or resumes) a coaching session for this game — every ready
   * game offers this alongside Review, source and prior visits included:
   * reviewing and coaching are two different things you can always do with
   * the same game, not two rungs of one ladder. */
  onCoach: (gameId: string) => void;
  onAnalyze: (gameId: string) => void;
  onExportPgn: (gameId: string) => void;
  onCopyPgn: (gameId: string) => void;
  onDelete: (gameId: string) => void;
}

/** One full-size row for Find games' list. A ready game offers Review and
 * Coach side by side; every other status keeps its single contextual action
 * (Get coach analysis / nothing) — see statusAndActionFor. The red Delete
 * button is always present and confirms first (DeleteGameButton); PGN
 * export/copy live in the overflow menu. */
export function GameRow({ game, onSelect, onReview, onCoach, onAnalyze, onExportPgn, onCopyPgn, onDelete }: GameRowProps): ReactNode {
  const status = statusAndActionFor(game);
  const dot = userSideResult(game);
  const date = game.playedAt ?? game.createdAt;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];
  const userIsWhite = game.userColor === 'white';

  return (
    <li className="game-row">
      <div className="game-row__top">
        <span className="game-row__players">
          <span className={userIsWhite ? 'game-row__you' : undefined}>{whiteName}</span>
          <span className="game-row__vs">vs</span>
          <span className={!userIsWhite ? 'game-row__you' : undefined}>{blackName}</span>
        </span>
        {dot && (
          <span className={`badge game-row__result game-row__result--${dot.label}`} title={dot.label}>
            {dot.symbol}
          </span>
        )}
        <OverflowMenu
          label={`More actions for ${whiteName} vs. ${blackName}`}
          items={[
            { label: 'Download PGN', onSelect: () => onExportPgn(game.id) },
            { label: 'Copy PGN', onSelect: () => onCopyPgn(game.id) }
          ]}
        />
      </div>

      <span className="game-row__meta">
        {sourceLabelFor(game.source)}
        <span aria-hidden="true">&middot;</span>
        <CalendarIcon width={13} height={13} />
        <time dateTime={date}>{new Date(date).toLocaleDateString()}</time>
        {game.timeControl && <span>&middot; {game.timeControl}</span>}
        {'estimatedRating' in game && game.estimatedRating !== null && <span>&middot; ~{game.estimatedRating}</span>}
      </span>

      <div className="game-row__footer">
        <span
          className={
            status.statusVariant === 'neutral'
              ? 'badge game-row__status'
              : `badge badge--${status.statusVariant} game-row__status`
          }
          data-animate={status.animateStatus ? 'true' : undefined}
        >
          {status.statusLabel}
        </span>

        <div className="game-row__actions">
          {status.actionKind === 'reviewCoach' ? (
            <>
              <button type="button" className="btn-secondary game-row__action" onClick={() => onReview(game.id)}>
                <EyeIcon width={16} height={16} />
                Review
              </button>
              <button type="button" className="btn-primary game-row__action" onClick={() => onCoach(game.id)}>
                <MessageCircleIcon width={16} height={16} />
                Coach
              </button>
            </>
          ) : (
            status.actionLabel && (
              <button
                type="button"
                className="btn-primary game-row__action"
                onClick={() => (status.actionKind === 'analyze' ? onAnalyze(game.id) : onSelect(game.id))}
              >
                {status.actionLabel}
              </button>
            )
          )}
          <DeleteGameButton game={game} onDelete={onDelete} variant="labeled" />
        </div>
      </div>
    </li>
  );
}
