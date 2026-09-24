import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { ReactNode } from 'react';
import { apiDelete, apiPost, describeApiError } from '../../api/client.js';
import { Modal } from '../../components/Modal.js';
import { describeGameOver, type BotGameOverInfo } from './botGameOver.js';
import './GameOverDialog.css';

export interface GameOverDialogProps {
  gameOver: BotGameOverInfo;
  gameId: string;
  userColor: 'white' | 'black';
  botName: string;
  /** Dismisses the popup, leaving the finished board up to look over. */
  onContinue: () => void;
  /** The game was analysed and kept, or deleted — nothing left to look at here. */
  onDone: () => void;
}

const KeepResponseSchema = z.object({ analysisId: z.string() });

/** Shown once, in place, the moment a play_bot game ends. A bot game is not
 * analysed automatically: the student either keeps it — it is analysed, takes
 * a slot from the import limits and the library, and joins the Games list to
 * review or coach — or deletes it, which removes it and costs nothing.
 * "Decide later" just dismisses this popup so the board can still be looked
 * over; the game stays unanalysed until they choose. */
export function GameOverDialog({ gameOver, gameId, userColor, botName, onContinue, onDone }: GameOverDialogProps): ReactNode {
  const queryClient = useQueryClient();
  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: ['games'] });
    void queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    onDone();
  };
  const keep = useMutation({
    mutationFn: () => apiPost(`/api/games/${gameId}/keep`, {}, KeepResponseSchema),
    onSuccess: settled
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/games/${gameId}`),
    onSuccess: settled
  });
  const busy = keep.isPending || remove.isPending;
  const error = describeApiError(keep.error ?? remove.error);

  return (
    <Modal title="Game over" onClose={onContinue}>
      <p className="game-over-dialog__result">{describeGameOver(gameOver, userColor, botName)}</p>
      <p className="game-over-dialog__question">Analyse this game and keep it, or delete it?</p>
      <p className="game-over-dialog__note">
        Keeping it analyses the game and adds it to your Games list to review or coach. It counts toward your daily and
        weekly import limits and your game library. Deleting removes it and uses nothing.
      </p>
      {error && (
        <p className="game-over-dialog__error" role="alert">
          {error}
        </p>
      )}
      <div className="game-over-dialog__actions">
        <button type="button" className="game-over-dialog__continue" disabled={busy} onClick={() => keep.mutate()}>
          {keep.isPending ? 'Starting analysis…' : 'Analyse & keep'}
        </button>
        <button type="button" className="game-over-dialog__delete" disabled={busy} onClick={() => remove.mutate()}>
          {remove.isPending ? 'Deleting…' : 'Delete game'}
        </button>
        <button type="button" className="game-over-dialog__later" disabled={busy} onClick={onContinue}>
          Decide later
        </button>
      </div>
    </Modal>
  );
}
