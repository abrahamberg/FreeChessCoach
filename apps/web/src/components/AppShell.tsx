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

// Every route that puts a board on screen (session/bot-session/practice)
// renders its own back-navigation header directly above it (SessionHeader,
// PuzzleSessionPage's own header) — showing the global top bar and bottom
// tab bar on top of that would cost the board vertical space it needs more
// than a second nav layer, and turns the brand/primary-nav links into an
// easy accidental tap away from a live game.
const BOARD_ROUTE_PREFIXES = ['/session/', '/bot-session/', '/practice/'];

function isBoardRoute(pathname: string): boolean {
  return BOARD_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** design-improvements.md (redesign, 2026-08-24): a sticky top bar — logo,
 * primary nav, and an account avatar menu (Settings/Sign out) — replaces the
 * old icon rail of stacked nav links, and stays visible on every route
 * except a board route (see isBoardRoute above), which hides it entirely in
 * favor of its own page-level back button. Below the desktop breakpoint the
 * primary nav also appears as a bottom tab bar — that one also hides on a
 * board route. */
export function AppShell({ children }: AppShellProps): ReactNode {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();
  const showGlobalNav = !isBoardRoute(pathname);
  const showBottomTabBar = showGlobalNav && !isDesktop;

  return (
    <div className="app-shell" data-layout={isDesktop ? 'desktop' : 'mobile'} data-bottom-bar={showBottomTabBar}>
      {showGlobalNav && <TopBar isDesktop={isDesktop} />}
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
