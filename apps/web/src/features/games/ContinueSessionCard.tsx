import type { GameListItem } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { MessageCircleIcon, PlayCircleIcon } from '../../components/Icon.js';
import './ContinueSessionCard.css';

export interface ContinueSessionCardProps {
  /** Must have a live `sessionId` — GamesPage filters to only these before
   * rendering the "Continue" section, so this never has to fall back to
   * anything else. */
  game: GameListItem;
  onContinue: (gameId: string) => void;
}

const TYPE_LABEL: Record<'coach_play' | 'vs_bot', string> = {
  coach_play: 'Coaching session',
  vs_bot: 'Bot game'
};

/** Games (home)'s "Continue" section — an in-progress play session (live
 * coaching, or a game against a bot) surfaced above the source-filtered
 * list rather than buried in whichever tab it happens to fall under
 * (Daniel's IA feedback: the game the student hasn't finished yet is the
 * one they most likely came back for). */
export function ContinueSessionCard({ game, onContinue }: ContinueSessionCardProps): ReactNode {
  const isCoach = game.source === 'coach_play';
  const Icon = isCoach ? MessageCircleIcon : PlayCircleIcon;
  const [whiteName, blackName] = [game.whiteName ?? '?', game.blackName ?? '?'];

  return (
    <div className="card continue-session-card">
      <Icon width={22} height={22} className="continue-session-card__icon" />
      <div className="continue-session-card__body">
        <span className="continue-session-card__type">{TYPE_LABEL[isCoach ? 'coach_play' : 'vs_bot']}</span>
        <span className="continue-session-card__players">
          {whiteName} vs {blackName}
        </span>
      </div>
      <button type="button" className="btn-primary" onClick={() => onContinue(game.id)}>
        Continue
      </button>
    </div>
  );
}
