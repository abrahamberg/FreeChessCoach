import type { GameListItem } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { TrashIcon } from '../../components/Icon.js';
import './DeleteGameButton.css';

export interface DeleteGameButtonProps {
  game: GameListItem;
  onDelete: (gameId: string) => void;
  /** 'icon' (default) is the compact red trash can used on cards; 'labeled'
   * adds the word for roomier rows. */
  variant?: 'icon' | 'labeled';
}

/** The one red trash can every game surface shares (Continue, Recently
 * imported, Find games): click opens a confirmation dialog naming the game
 * (design-improvements.md §6, P0 — a destructive action always confirms),
 * and only confirming calls `onDelete`. */
export function DeleteGameButton({ game, onDelete, variant = 'icon' }: DeleteGameButtonProps): ReactNode {
  const [confirming, setConfirming] = useState(false);
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];

  return (
    <>
      <button
        type="button"
        className={variant === 'icon' ? 'delete-game-button delete-game-button--icon' : 'delete-game-button'}
        title="Delete game"
        aria-label={`Delete ${whiteName} vs. ${blackName}`}
        onClick={() => setConfirming(true)}
      >
        <TrashIcon width={16} height={16} />
        {variant === 'labeled' && 'Delete'}
      </button>
      {confirming && (
        <ConfirmDialog
          title="Delete this game?"
          description={
            <p>
              Deleting <strong>{whiteName} vs. {blackName}</strong> also deletes its analysis and any coaching
              sessions. This cannot be undone.
            </p>
          }
          confirmLabel="Delete game"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onDelete(game.id);
          }}
        />
      )}
    </>
  );
}
