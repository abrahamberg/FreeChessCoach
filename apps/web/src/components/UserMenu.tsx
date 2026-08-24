import { UserProfileSchema } from '@freechesscoach/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { ChevronDownIcon, LogOutIcon, SettingsIcon } from './Icon.js';
import './UserMenu.css';

function initialsFor(displayName: string | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}

/** design-improvements.md (redesign, 2026-08-24): account actions live
 * behind an avatar menu in the top bar — not stacked as an equal-weight nav
 * item — matching the shape of every mainstream SaaS product. Fetches the
 * same ['profile'] query SettingsPage uses, so opening the menu never costs
 * a second network round trip once Settings has been visited. */
export function UserMenu(): ReactNode {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const initials = initialsFor(profileQuery.data?.displayName);

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
          {initials}
        </span>
        <ChevronDownIcon width={15} height={15} />
      </button>

      {isOpen && (
        <div className="user-menu__panel" role="menu">
          <div className="user-menu__header">
            <span className="user-menu__avatar user-menu__avatar--lg" aria-hidden="true">
              {initials}
            </span>
            <span className="user-menu__identity">
              <span className="user-menu__name">{profileQuery.data?.displayName ?? 'Account'}</span>
              <span className="user-menu__email">{profileQuery.data?.email ?? ''}</span>
            </span>
          </div>
          <div className="user-menu__divider" />
          <NavLink to="/settings" role="menuitem" className="user-menu__item" onClick={() => setIsOpen(false)}>
            <SettingsIcon width={17} height={17} />
            Settings
          </NavLink>
          {/* Ends the oauth2-proxy session (architecture §11) and lands back
           * on the public landing page — not a fetch/mutation, so a plain
           * link, same as before (previously in SettingsPage directly). */}
          <a href="/oauth2/sign_out?rd=/" role="menuitem" className="user-menu__item user-menu__item--muted">
            <LogOutIcon width={17} height={17} />
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}
