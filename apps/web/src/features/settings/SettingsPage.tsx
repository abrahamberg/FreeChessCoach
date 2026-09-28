import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiDelete, describeApiError } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { useMoveSounds } from '../../sounds/move-sounds-setting.js';
import { AiSetupHelp } from './AiSetupHelp.js';
import { CoachPersonaSelect } from './CoachPersonaSelect.js';
import { EngineFields } from './EngineFields.js';
import { LinkedAccountsFields } from './LinkedAccountsFields.js';
import { LlmSetupSection } from './LlmSetupSection.js';
import { ProfileFields } from './ProfileFields.js';
import { SettingsSection } from './SettingsSection.js';
import { VoiceFields } from './VoiceFields.js';
import './SettingsPage.css';

type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'freechesscoach-theme';
function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

/** design.md §4.4: Settings — Profile, API keys, Appearance, Account.
 * Owns fetching (AGENTS.md rule 7); every child below is presentational. */
export function SettingsPage(): ReactNode {
  const [theme, setTheme] = useState<Theme | null>(() => readStoredTheme());
  const [showLegalMoveDots, setShowLegalMoveDots] = useShowLegalMoveDots();
  const [moveSounds, setMoveSounds] = useMoveSounds();
  const { hash } = useLocation();
  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = useState(false);

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [theme]);

  const profileQuery = useProfile();
  const llmSetupQuery = useLlmSetupStatus();
  const updateProfile = useUpdateProfile();

  // Client-side route changes (e.g. the topbar engine indicator linking to
  // /settings#settings-engine) don't get the browser's native scroll-to-
  // fragment behavior the way a full page load would, so it's done by hand
  // here — gated on isSuccess since the target section only exists in the
  // DOM once the "Loading…" early-return below has passed.
  useEffect(() => {
    if (!hash || !profileQuery.isSuccess) return;
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, profileQuery.isSuccess]);

  // Irreversible: wipes the account and everything under it server-side
  // (services/account.ts). Ends the oauth2-proxy session on success the
  // same way the "Sign out" link below does — otherwise the next request
  // would just recreate a fresh, empty account under the same identity.
  const deleteAccountMutation = useMutation({
    mutationFn: () => apiDelete('/api/users/me'),
    onSuccess: () => {
      window.location.href = '/oauth2/sign_out?rd=/';
    }
  });

  if (profileQuery.isLoading || llmSetupQuery.isLoading) return <p>Loading…</p>;
  if (profileQuery.isError || !profileQuery.data || llmSetupQuery.isError || !llmSetupQuery.data) {
    return <p>Could not load your settings.</p>;
  }

  const profile = profileQuery.data;
  const llmSetup = llmSetupQuery.data;

  return (
    <div className="page settings-page">
      <header className="settings-page__header">
        <h1>Settings</h1>
        <p className="settings-page__description">
          Manage your profile, coach, and account. <Link to="/welcome">Run the welcome guide again</Link>.
        </p>
      </header>

      <div className="settings-page__sections">
        <SettingsSection label="Profile" title="Profile">
          <ProfileFields profile={profile} />
        </SettingsSection>

        <SettingsSection label="Coach" title="Coach">
          <p>Pick who coaches you. It's cosmetic — every coach gives the same advice, just in a different voice.</p>
          <CoachPersonaSelect
            value={profile.coachPersona}
            onChange={(coachPersona) => updateProfile.mutate({ coachPersona })}
          />
        </SettingsSection>

        <SettingsSection label="Coach voice" title="Coach voice">
          <p>Have the coach's replies read aloud. Off by default.</p>
          <VoiceFields profile={profile} llmSetup={llmSetup} />
        </SettingsSection>

        <SettingsSection label="Linked accounts" title="Linked accounts">
          <p>
            Set these so we can tell which side you played when you import a game — you won&rsquo;t be asked
            again for games from that site.
          </p>
          <LinkedAccountsFields profile={profile} />
        </SettingsSection>

        <SettingsSection label="Board" title="Board">
          <p>Show dots on the squares a selected piece can legally move to.</p>
          <button type="button" aria-pressed={showLegalMoveDots} onClick={() => setShowLegalMoveDots(true)}>
            Show
          </button>
          <button type="button" aria-pressed={!showLegalMoveDots} onClick={() => setShowLegalMoveDots(false)}>
            Hide
          </button>
          <p>Play a sound for each move: yours, your opponent's, a check, and in reviews and courses a bad or great move.</p>
          <button type="button" aria-pressed={moveSounds} onClick={() => setMoveSounds(true)}>
            Sounds on
          </button>
          <button type="button" aria-pressed={!moveSounds} onClick={() => setMoveSounds(false)}>
            Sounds off
          </button>
        </SettingsSection>

        <SettingsSection id="settings-engine" label="Engine" title="Engine">
          <EngineFields profile={profile} />
        </SettingsSection>

        <SettingsSection id="settings-api-keys" label="API keys" title="AI setup">
          <p>Your endpoint and API key are tested, encrypted with your unlock phrase, and kept available only while you are active. We never show the key again.</p>
          <AiSetupHelp />
          <LlmSetupSection status={llmSetup} />
        </SettingsSection>

        <SettingsSection label="Appearance" title="Appearance">
          <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            Light
          </button>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            Dark
          </button>
        </SettingsSection>

        <SettingsSection label="Account" title="Account">
          <p>{profile.email}</p>
          {/* Ends the oauth2-proxy session (architecture §11) and lands back on
           * the public landing page — not a fetch/mutation, so a plain link. */}
          <a className="btn-secondary" href="/oauth2/sign_out?rd=/">
            Sign out
          </a>

          <div className="settings-page__danger-zone">
            <h3>Delete account</h3>
            <p>
              Permanently deletes your account and everything in it — games, analyses, coaching sessions, and
              progress. This cannot be undone.
            </p>
            <button
              type="button"
              className="btn-destructive"
              onClick={() => setConfirmingDeleteAccount(true)}
              disabled={deleteAccountMutation.isPending}
            >
              Delete account
            </button>
            {deleteAccountMutation.isError && <p role="alert">{describeApiError(deleteAccountMutation.error)}</p>}
          </div>

          {confirmingDeleteAccount && (
            <ConfirmDialog
              title="Delete your account?"
              description={
                <p>
                  This permanently deletes <strong>{profile.email}</strong> and every game, analysis, and coaching
                  session tied to it. This cannot be undone.
                </p>
              }
              confirmLabel="Delete account"
              onCancel={() => setConfirmingDeleteAccount(false)}
              onConfirm={() => {
                setConfirmingDeleteAccount(false);
                deleteAccountMutation.mutate();
              }}
            />
          )}
        </SettingsSection>
      </div>

      <footer className="settings-page__legal">
        {/* /privacy and /terms are static, unauthenticated pages
         * (apps/web/public/) — plain links, not client-side routes. */}
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </footer>
    </div>
  );
}
