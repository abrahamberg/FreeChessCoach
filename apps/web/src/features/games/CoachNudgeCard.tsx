import type { CoachNudge, CoachPersona, GameListItem } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { EyeIcon, MessageCircleIcon, PlayCircleIcon } from '../../components/Icon.js';
import { ResultBadge } from '../../components/ResultBadge.js';
import { coachNudgeLine, IDLE_TOPICS, type IdleTopic } from './coach-nudge-lines.js';
import { gameOutcome, opponentName, shortDate } from './gameDisplay.js';
import './CoachNudgeCard.css';

export interface CoachNudgeCardProps {
  nudge: CoachNudge;
  /** The student's chosen coach, who does the talking. */
  persona: CoachPersona;
  onCoach: (gameId: string) => void;
  onReview: (gameId: string) => void;
}

/** The Games page's coach area: the student's own coach — their face beside a
 * speech bubble — saying what to do next (the server picks the situation,
 * GET /api/users/me/coach-nudge), with the button that does it. While a new
 * student is still importing, it also shows pattern tracking's "N of 15"
 * progress. */
export function CoachNudgeCard({ nudge, persona, onCoach, onReview }: CoachNudgeCardProps): ReactNode {
  // Fixed for the visit, so the line doesn't change on every render.
  const [pick] = useState(Math.random);
  const [idleTopic] = useState<IdleTopic>(() => IDLE_TOPICS[Math.floor(Math.random() * IDLE_TOPICS.length)]!);
  const remaining = nudge.kind === 'import_first' ? nudge.required - nudge.ratedGames : 0;
  const line = coachNudgeLine({ persona, kind: nudge.kind, remaining, idleTopic, pick });

  return (
    <section className="coach-nudge card" aria-label="Your coach">
      {nudge.kind === 'import_first' && (
        <>
          <div className="coach-nudge__header">
            <h2>Unlock pattern tracking</h2>
            <span className="coach-nudge__count">
              {nudge.ratedGames} of {nudge.required}
            </span>
          </div>
          <progress
            className="coach-nudge__bar"
            value={nudge.ratedGames}
            max={nudge.required}
            aria-label={`${nudge.ratedGames} of ${nudge.required} rated games imported`}
          />
        </>
      )}
      <div className="coach-nudge__speech">
        <CoachAvatar persona={persona} size="chat" />
        <div className="coach-nudge__bubble">
          <p>{line}</p>
          <NudgeActions nudge={nudge} idleTopic={idleTopic} onCoach={onCoach} onReview={onReview} />
        </div>
      </div>
    </section>
  );
}

function NudgeActions({
  nudge,
  idleTopic,
  onCoach,
  onReview
}: {
  nudge: CoachNudge;
  idleTopic: IdleTopic;
  onCoach: (gameId: string) => void;
  onReview: (gameId: string) => void;
}): ReactNode {
  switch (nudge.kind) {
    case 'practice':
      return (
        <div className="coach-nudge__actions">
          <Link to={`/practice/${nudge.assignmentId}`} className="btn-primary">
            Start practice
          </Link>
        </div>
      );
    case 'first_coaching':
    case 'coach_game':
      return <OfferedGame game={nudge.game} onCoach={onCoach} onReview={onReview} />;
    case 'first_play':
    case 'play_coach':
      return (
        <div className="coach-nudge__actions">
          <Link to="/play/new" className="btn-primary">
            <PlayCircleIcon width={16} height={16} />
            Play with the coach
          </Link>
        </div>
      );
    case 'import_more':
      return (
        <div className="coach-nudge__actions">
          <a href="https://lichess.org/" target="_blank" rel="noopener noreferrer" className="btn-secondary">
            Play on Lichess
          </a>
          <a
            href="https://www.chess.com/play/online"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Play on Chess.com
          </a>
        </div>
      );
    case 'idle':
      if (idleTopic === 'analyze') {
        return (
          <div className="coach-nudge__actions">
            <Link to="/games/find" className="btn-secondary">
              Find a game
            </Link>
          </div>
        );
      }
      if (idleTopic === 'bots') {
        return (
          <div className="coach-nudge__actions">
            <Link to="/play-bot/new" className="btn-secondary">
              Play a bot
            </Link>
          </div>
        );
      }
      return null;
    case 'import_first':
      // The Import games card sits right above.
      return null;
  }
}

function OfferedGame({
  game,
  onCoach,
  onReview
}: {
  game: GameListItem;
  onCoach: (gameId: string) => void;
  onReview: (gameId: string) => void;
}): ReactNode {
  const outcome = gameOutcome(game);
  const date = game.playedAt ?? game.createdAt;
  return (
    <>
      <p className="coach-nudge__game">
        {outcome && <ResultBadge outcome={outcome} />}
        vs {opponentName(game)} · {shortDate(date)}
      </p>
      <div className="coach-nudge__actions">
        <button type="button" className="btn-primary" onClick={() => onCoach(game.id)}>
          <MessageCircleIcon width={16} height={16} />
          Coach me on this game
        </button>
        <button type="button" className="btn-secondary" onClick={() => onReview(game.id)}>
          <EyeIcon width={16} height={16} />
          Review
        </button>
      </div>
    </>
  );
}
