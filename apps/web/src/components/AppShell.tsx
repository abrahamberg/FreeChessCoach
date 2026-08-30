import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useEngineActivityIndicator } from '../hooks/useEngineActivityIndicator.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { EngineActivityIndicator } from './EngineActivityIndicator.js';
import { BarChartIcon, BoardIcon, TrendingUpIcon } from './Icon.js';
import { UserMenu } from './UserMenu.js';
import './AppShell.css';

export interface AppShellProps {
  children: ReactNode;
}

const NAV_DESTINATIONS = [
  { to: '/games', label: 'Games', Icon: BoardIcon },
  { to: '/dashboard', label: 'Progress', Icon: TrendingUpIcon },
  { to: '/stats', label: 'Stats', Icon: BarChartIcon }
];

/** design-improvements.md (redesign, 2026-08-24): a sticky top bar — logo,
 * primary nav, and an account avatar menu (Settings/Sign out) — replaces the
 * old icon rail of stacked nav links, and stays visible on every route
 * (including an active session) so the app never loses its identity/nav
 * mid-session. Below the desktop breakpoint the primary nav also appears as
 * a bottom tab bar — that one DOES hide during an active session (design doc
 * P0: "prevent bottom navigation from covering session content"), since
 * SessionHeader's own back/menu bar already sits directly under the top bar
 * and the board needs the vertical space more than a second nav layer does. */
export function AppShell({ children }: AppShellProps): ReactNode {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  const isSession = pathname.startsWith('/session/');
  const showBottomTabBar = !isDesktop && !isSession;

  return (
    <div className="app-shell" data-layout={isDesktop ? 'desktop' : 'mobile'} data-bottom-bar={showBottomTabBar}>
      <TopBar isDesktop={isDesktop} />
      <main className="app-shell__content">{children}</main>
      {showBottomTabBar && <BottomTabBar />}
    </div>
  );
}

function Brand(): ReactNode {
  return (
    <NavLink to="/games" className="app-shell__brand" title="FreeChessCoach">
      <img src="/brand/logo.png" alt="" className="app-shell__mark" width="30" height="30" />
      <span className="app-shell__wordmark">FreeChessCoach</span>
    </NavLink>
  );
}

function TopBar({ isDesktop }: { isDesktop: boolean }): ReactNode {
  // Computed once here (not inside EngineActivityIndicator/UserMenu
  // individually) so desktop and mobile share a single useActiveAnalyses
  // SSE subscription instead of opening one each.
  const engineActivity = useEngineActivityIndicator();

  return (
    <header className="app-shell__topbar">
      <div className="app-shell__topbar-inner">
        <Brand />
        {isDesktop && (
          <nav className="app-shell__pill-nav" aria-label="Primary">
            {NAV_DESTINATIONS.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <Icon width={16} height={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="app-shell__topbar-end">
          {isDesktop && <EngineActivityIndicator state={engineActivity} />}
          <UserMenu engineActivity={isDesktop ? undefined : engineActivity} />
        </div>
      </div>
    </header>
  );
}

function BottomTabBar(): ReactNode {
  return (
    <nav className="bottom-tab-bar" aria-label="bottom tab bar">
      {NAV_DESTINATIONS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
          <Icon width={21} height={21} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
