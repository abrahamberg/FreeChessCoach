import { UserProfileSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { getDemoRuntime } from '../demo/demoRuntime.js';
import { AiLockMenuRow } from './AiLockMenuRow.js';
import { describeEngineActivity } from './EngineActivityIndicator.js';
import { BugIcon, LogOutIcon, PlusIcon, SettingsIcon } from './Icon.js';
import { TunnelStatusDots } from './TunnelStatusDots.js';
import type { EngineActivityIndicatorState } from '../hooks/useEngineActivityIndicator.js';
import './UserMenu.css';

export interface AccountMenuSectionsProps {
  /** Shown as a row above Settings when set — wherever there's no
   * permanent topbar pill showing the same state. */
  engineActivity?: EngineActivityIndicatorState;
  onClose: () => void;
  /** The caller owns the BugReportModal: it must outlive the closed menu. */
  onReportBug: () => void;
  /** The caller owns the unlock popup, for the same reason. */
  onUnlock: () => void;
  /** A page's own rows (the board views' session actions), grouped right
   * under the identity header. */
  children?: ReactNode;
}

export function initialsFor(displayName: string | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

/** The account menu's contents — identity, engine status, Settings, Report a
 * bug, Sign out — shared by the topbar UserMenu and the board views' session
 * menu, so both read as the same menu. Fetches the same ['profile'] query
 * SettingsPage uses, so it never costs a second round trip. */
export function AccountMenuSections({ engineActivity, onClose, onReportBug, onUnlock, children }: AccountMenuSectionsProps): ReactNode {
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });

  return (
    <>
      <div className="user-menu__header">
        <span className="user-menu__avatar user-menu__avatar--lg" aria-hidden="true">
          {initialsFor(profileQuery.data?.displayName)}
        </span>
        <span className="user-menu__identity">
          <span className="user-menu__name">{profileQuery.data?.displayName ?? 'Account'}</span>
          <span className="user-menu__email">{profileQuery.data?.email ?? ''}</span>
        </span>
      </div>
      {children && (
        <>
          <div className="user-menu__divider" />
          {children}
        </>
      )}
      {engineActivity && (
        <>
          <div className="user-menu__divider" />
          <EngineActivityMenuRow state={engineActivity} onNavigate={onClose} />
        </>
      )}
      <div className="user-menu__divider" />
      <AiLockMenuRow
        onUnlock={() => {
          onClose();
          onUnlock();
        }}
      />
      {/* docs/courses.md §2: only accounts a moderator switched on. */}
      {profileQuery.data?.canCreateCourses && !getDemoRuntime() && (
        <NavLink to="/studio" role="menuitem" className="user-menu__item" onClick={onClose}>
          <PlusIcon width={17} height={17} />
          Course studio
        </NavLink>
      )}
      <NavLink to="/settings" role="menuitem" className="user-menu__item" onClick={onClose}>
        <SettingsIcon width={17} height={17} />
        Settings
      </NavLink>
      {/* The demo has no account to report from, and refuses every write. */}
      {!getDemoRuntime() && (
        <button
          type="button"
          role="menuitem"
          className="user-menu__item user-menu__item--button"
          onClick={() => {
            onClose();
            onReportBug();
          }}
        >
          <BugIcon width={17} height={17} />
          Report a bug
        </button>
      )}
      {/* Ends the oauth2-proxy session (architecture §11) and lands back
       * on the public landing page — not a fetch/mutation, so a plain link. */}
      <a href="/oauth2/sign_out?rd=/" role="menuitem" className="user-menu__item user-menu__item--muted">
        <LogOutIcon width={17} height={17} />
        Sign out
      </a>
    </>
  );
}

/** Stand-in for the desktop topbar's EngineActivityIndicator pill — same
 * describeEngineActivity() output (badge, activity detail, queue bar),
 * rendered as a menu row and linking to the same place. */
function EngineActivityMenuRow({ state, onNavigate }: { state: EngineActivityIndicatorState; onNavigate: () => void }): ReactNode {
  const info = describeEngineActivity(state);
  return (
    <NavLink to="/settings#settings-engine" role="menuitem" className="user-menu__item" title={info.title} onClick={onNavigate}>
      <span className={`engine-activity-indicator__dot${state.kind === 'idle' ? ' engine-activity-indicator__dot--idle' : ''}`} aria-hidden="true" />
      {info.label}
      <TunnelStatusDots engineMode={state.engineMode} />
    </NavLink>
  );
}
