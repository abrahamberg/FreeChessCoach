import { UserProfileSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiGet } from '../api/client.js';
import { BugReportModal } from '../features/bug-report/BugReportModal.js';
import { AccountMenuSections, initialsFor } from './AccountMenuSections.js';
import { MenuUnlockModal } from './MenuUnlockModal.js';
import { BoardMenuItem } from './BoardMenu.js';
import { ChevronDownIcon } from './Icon.js';
import { usePageMenu } from './PageMenu.js';
import type { EngineActivityIndicatorState } from '../hooks/useEngineActivityIndicator.js';
import './UserMenu.css';

/** design-improvements.md (redesign, 2026-08-24): account actions live
 * behind an avatar menu in the top bar — not stacked as an equal-weight nav
 * item — matching the shape of every mainstream SaaS product. Fetches the
 * same ['profile'] query SettingsPage uses, so opening the menu never costs
 * a second network round trip once Settings has been visited. */
export interface UserMenuProps {
  /** Set only on mobile (AppShell's TopBar) — the same state the desktop
   * pill would otherwise show, embedded as a menu row instead since there's
   * no room for a permanent topbar pill at that width. */
  engineActivity?: EngineActivityIndicatorState;
}

export function UserMenu({ engineActivity }: UserMenuProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pageItems = usePageMenu();

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        type="button"
        className="user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="user-menu__avatar" aria-hidden="true">
          {initialsFor(profileQuery.data?.displayName)}
        </span>
        <ChevronDownIcon width={15} height={15} />
      </button>

      {isOpen && (
        <div className="user-menu__panel" role="menu">
          <AccountMenuSections
            engineActivity={engineActivity}
            onClose={() => setIsOpen(false)}
            onReportBug={() => setIsReporting(true)}
            onUnlock={() => setIsUnlocking(true)}
          >
            {pageItems.map((item) => (
              <BoardMenuItem key={item.label} item={item} onClose={() => setIsOpen(false)} />
            ))}
          </AccountMenuSections>
        </div>
      )}
      {isUnlocking && <MenuUnlockModal onClose={() => setIsUnlocking(false)} />}
      {isReporting && <BugReportModal onClose={() => setIsReporting(false)} />}
    </div>
  );
}
