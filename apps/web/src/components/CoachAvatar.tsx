import type { CoachPersona } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import './CoachAvatar.css';

export type CoachAvatarSize = 'settings' | 'header' | 'chat';

export interface CoachAvatarProps {
  persona?: CoachPersona;
  size?: CoachAvatarSize;
}

/** Renders one portrait from the supplied 4x2 coach sprite sheet. The
 * persona order is kept in CSS so the same crop is shared by Settings and
 * the compact chat-run marker. */
export function CoachAvatar({ persona = 'general', size = 'chat' }: CoachAvatarProps): ReactNode {
  return (
    <span
      className={`coach-avatar-image coach-avatar-image--${size}`}
      data-testid="coach-avatar"
      data-coach-persona={persona}
      aria-hidden="true"
    />
  );
}
