import type { ReactNode } from 'react';
import './UserAvatar.css';

export interface UserAvatarProps {
  displayName: string | undefined;
}

/** Two letters, not UserMenu.tsx's own single-letter initialsFor() — this
 * sits beside a full name-length CoachAvatar portrait, and one letter reads
 * as too sparse next to it. Splits on whitespace/underscore/hyphen so a
 * platform-style handle ("Dany_Abr") still yields two initials ("DA"), not
 * just its first letter. */
function initialsFor(displayName: string | undefined): string {
  const segments = displayName?.trim().split(/[\s_-]+/).filter(Boolean) ?? [];
  const initials = (segments[0]?.[0] ?? '') + (segments[1]?.[0] ?? '');
  return initials ? initials.toUpperCase() : '?';
}

/** PagedMessageCard's own-message marker (SessionPage's mobile paged coach
 * chat): the coach gets a portrait on the left (CoachAvatar), the student
 * gets their own initials in a circle on the right — so which side of the
 * conversation a message came from is never ambiguous even though only one
 * message shows on screen at a time. */
export function UserAvatar({ displayName }: UserAvatarProps): ReactNode {
  return (
    <span className="user-avatar-initials" data-testid="user-avatar" aria-hidden="true">
      {initialsFor(displayName)}
    </span>
  );
}
