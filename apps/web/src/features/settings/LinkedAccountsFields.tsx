import type { UserProfile } from '@freechesscoach/shared';
import type { ReactNode } from 'react';
import { useUpdateProfile } from '../../hooks/useProfile.js';
import { PlatformUsernameForm } from './PlatformUsernameForm.js';

export function LinkedAccountsFields({ profile }: { profile: UserProfile }): ReactNode {
  const update = useUpdateProfile();
  return (
    <>
      <PlatformUsernameForm
        platform="lichess"
        label="Lichess username"
        value={profile.lichessUsername}
        onSave={(lichessUsername) => update.mutate({ lichessUsername })}
        onDelete={() => update.mutate({ lichessUsername: null })}
      />
      <p className="settings-page__hint">
        On <a href="https://lichess.org/" target="_blank" rel="noopener noreferrer">Lichess</a> it is the name at the top right once you are logged in. It is also the end of your profile address: lichess.org/@/<em>username</em>.
      </p>
      <PlatformUsernameForm
        platform="chesscom"
        label="Chess.com username"
        value={profile.chesscomUsername}
        onSave={(chesscomUsername) => update.mutate({ chesscomUsername })}
        onDelete={() => update.mutate({ chesscomUsername: null })}
      />
      <p className="settings-page__hint">
        On <a href="https://www.chess.com/" target="_blank" rel="noopener noreferrer">Chess.com</a> open your profile from your avatar or name. The username is the end of the profile address: chess.com/member/<em>username</em>.
      </p>
      <p className="settings-page__hint">Only the public username, never a password.</p>
    </>
  );
}
