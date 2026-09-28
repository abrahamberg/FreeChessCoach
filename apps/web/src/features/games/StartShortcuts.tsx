import type { CoachPersona } from '@freechesscoach/shared';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CoachAvatar } from '../../components/CoachAvatar.js';
import { ClipboardIcon, ImportIcon, KnightIcon, PawnIcon, PlayCircleIcon, type IconProps } from '../../components/Icon.js';
import './StartShortcuts.css';

export interface StartShortcutsProps {
  persona?: CoachPersona;
  /** Undefined while the quota is still loading, or if it failed to load —
   * the shortcuts still work as navigation, just without the count. */
  quota?: { used: number; limit: number };
}

interface ImportSource {
  tab: 'lichess' | 'chesscom' | 'paste' | 'file';
  label: string;
  icon: ComponentType<IconProps>;
}

// No brand logos (this app's one hand-drawn icon family carries no
// third-party marks — see Icon.tsx) — Lichess and Chess.com get their own
// chess-piece icon instead (knight/pawn, both sites' own visual shorthand).
const IMPORT_SOURCES: ImportSource[] = [
  { tab: 'lichess', label: 'Lichess', icon: KnightIcon },
  { tab: 'chesscom', label: 'Chess.com', icon: PawnIcon },
  { tab: 'paste', label: 'Paste PGN', icon: ClipboardIcon },
  { tab: 'file', label: 'PGN file', icon: ImportIcon }
];

/** The top of the Games page: one compact card with Play (with the coach —
 * their own portrait — or a bot) beside Import games (each source deep-links
 * into ImportPage's tab). The owner asked on 2026-09-28 for the two to take
 * less room than two full cards. Owns no fetching (AGENTS.md rule 7). */
export function StartShortcuts({ persona, quota }: StartShortcutsProps): ReactNode {
  const quotaFull = quota !== undefined && quota.used >= quota.limit;
  return (
    <div className="start-shortcuts card">
      <section className="start-shortcuts__group" aria-label="Play">
        <div className="start-shortcuts__header">
          <h2>Play</h2>
        </div>
        <div className="start-shortcuts__tiles start-shortcuts__tiles--play">
          <Link to="/play/new" className="start-shortcuts__tile" title="Live guidance while you play">
            <CoachAvatar persona={persona} size="chat" />
            Play with Coach
          </Link>
          <Link to="/play-bot/new" className="start-shortcuts__tile" title="Choose your opponent and time control">
            <span className="start-shortcuts__icon" aria-hidden="true">
              <PlayCircleIcon width={18} height={18} />
            </span>
            Play a Bot
          </Link>
        </div>
      </section>
      <div className="start-shortcuts__divider" aria-hidden="true" />
      <section className="start-shortcuts__group" aria-label="Import games">
        <div className="start-shortcuts__header">
          <h2>Import games</h2>
          {quota && (
            <span className={quotaFull ? 'start-shortcuts__quota start-shortcuts__quota--full' : 'start-shortcuts__quota'}>
              {quota.used} of {quota.limit} today
            </span>
          )}
        </div>
        <div className="start-shortcuts__tiles start-shortcuts__tiles--import">
          {IMPORT_SOURCES.map(({ tab, label, icon: Icon }) => (
            <Link key={tab} to={`/import?tab=${tab}`} className="start-shortcuts__tile">
              <span className="start-shortcuts__icon" aria-hidden="true">
                <Icon width={18} height={18} />
              </span>
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
