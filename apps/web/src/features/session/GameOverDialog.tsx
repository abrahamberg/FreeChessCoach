import type { ReactNode } from 'react';
import { Modal } from '../../components/Modal.js';
import { describeGameOver, type BotGameOverInfo } from './botGameOver.js';
import './GameOverDialog.css';

export interface GameOverDialogProps {
  gameOver: BotGameOverInfo;
  userColor: 'white' | 'black';
  botName: string;
  onContinue: () => void;
}

/** Shown once, in place, the moment a play_bot game ends — replaces the old
 * behavior of immediately swapping the whole page to SessionSummaryCard,
 * which felt like an unrelated navigation away from a game the student was
 * still looking at. "Continue" just dismisses this popup; the board and
 * status panel stay up underneath so the student can keep reviewing the
 * finished position. */
export function GameOverDialog({ gameOver, userColor, botName, onContinue }: GameOverDialogProps): ReactNode {
  return (
    <Modal title="Game over" onClose={onContinue}>
      <p className="game-over-dialog__result">{describeGameOver(gameOver, userColor, botName)}</p>
      <button type="button" className="game-over-dialog__continue" onClick={onContinue}>
        Continue
      </button>
    </Modal>
  );
}
