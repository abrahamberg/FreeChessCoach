import type { UserProfile } from '@freechesscoach/shared';
import { useState, type ReactNode } from 'react';
import { useUpdateProfile } from '../../hooks/useProfile.js';
import { BandSelect } from './BandSelect.js';
import { NicknameForm } from './NicknameForm.js';

/** Google sign-in fills the name with the part of the email before the @, which
 * is rarely what anyone goes by. */
function looksLikeEmailName(profile: UserProfile): boolean {
  return profile.displayName === profile.email.split('@')[0];
}

/** Welcome flow's first question: always an open field (not an "Edit" link),
 * empty when the current name is only the email's local part. Saves on blur
 * or Enter. */
function AskName({ profile }: { profile: UserProfile }): ReactNode {
  const update = useUpdateProfile();
  const [draft, setDraft] = useState(looksLikeEmailName(profile) ? '' : profile.displayName);

  function save(): void {
    const name = draft.trim();
    if (name && name !== profile.displayName) update.mutate({ displayName: name });
  }

  return (
    <div className="profile-ask-name">
      <label htmlFor="ask-name-input">What should your coach call you?</label>
      <input
        id="ask-name-input"
        value={draft}
        placeholder="Your first name"
        maxLength={60}
        autoComplete="given-name"
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
        }}
      />
    </div>
  );
}

/** Nickname and playing level. Used by Settings and the welcome flow;
 * `askName` swaps the small nickname row for the welcome flow's big question. */
export function ProfileFields({ profile, askName = false }: { profile: UserProfile; askName?: boolean }): ReactNode {
  const update = useUpdateProfile();
  return (
    <>
      {askName ? (
        <AskName profile={profile} />
      ) : (
        <div className="settings-page__profile-row">
          <span className="settings-page__profile-avatar" aria-hidden="true">
            {profile.displayName.trim()[0]?.toUpperCase() ?? '?'}
          </span>
          <NicknameForm value={profile.displayName} onSave={(displayName) => update.mutate({ displayName })} />
        </div>
      )}
      <div className="settings-page__field-label">Playing level</div>
      <BandSelect value={profile.ratingBand} onChange={(ratingBand) => update.mutate({ ratingBand })} />
    </>
  );
}
