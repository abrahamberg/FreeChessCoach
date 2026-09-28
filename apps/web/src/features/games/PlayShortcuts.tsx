import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { ArrowRightIcon, PlayCircleIcon } from '../../components/Icon.js';
import './ImportShortcuts.css';
import './PlayShortcuts.css';

export interface PlayShortcutsProps {
  persona?: CoachPersona;
}

/** The Games page's "Play" section, under Import games: a live game with the
 * coach (their own portrait) or against a bot. Play used to be its own page
 * and nav item; the owner moved it here on 2026-09-28 so the nav has room
 * for Courses. */
export function PlayShortcuts({ persona }: PlayShortcutsProps): ReactNode {
  return (
    <section className="import-shortcuts card" aria-label="Play">
      <div className="import-shortcuts__header">
        <h2>Play</h2>
      </div>
      <div className="play-shortcuts__options">
        <Link to="/play/new" className="import-shortcuts__option play-shortcuts__option">
          <CoachAvatar persona={persona} size="chat" />
          <span className="play-shortcuts__body">
            <span className="play-shortcuts__title">Play with Coach</span>
            <span className="play-shortcuts__description">Live guidance while you play.</span>
          </span>
          <ArrowRightIcon width={18} height={18} className="play-shortcuts__arrow" />
        </Link>
        <Link to="/play-bot/new" className="import-shortcuts__option play-shortcuts__option">
          <span className="import-shortcuts__option-icon" aria-hidden="true">
            <PlayCircleIcon width={22} height={22} />
          </span>
          <span className="play-shortcuts__body">
            <span className="play-shortcuts__title">Play a Bot</span>
            <span className="play-shortcuts__description">Choose your opponent and time control.</span>
          </span>
          <ArrowRightIcon width={18} height={18} className="play-shortcuts__arrow" />
        </Link>
      </div>
    </section>
  );
}
