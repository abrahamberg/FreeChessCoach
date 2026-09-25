import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiDelete, describeApiError } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';
import { useProfile, useUpdateProfile } from '../../hooks/useProfile.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { AiSetupHelp } from './AiSetupHelp.js';
import { CoachPersonaSelect } from './CoachPersonaSelect.js';
import { EngineFields } from './EngineFields.js';
import { LinkedAccountsFields } from './LinkedAccountsFields.js';
import { LlmSetupSection } from './LlmSetupSection.js';
import { ProfileFields } from './ProfileFields.js';
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

      <section aria-label="Profile" className="card">
        <h2>Profile</h2>
        <ProfileFields profile={profile} />
      </section>

      <section aria-label="Coach" className="card">
        <h2>Coach</h2>
        <p>Pick who coaches you. It's cosmetic — every coach gives the same advice, just in a different voice.</p>
        <CoachPersonaSelect
          value={profile.coachPersona}
          onChange={(coachPersona) => updateProfile.mutate({ coachPersona })}
        />
      </section>

      <section aria-label="Coach voice" className="card">
        <h2>Coach voice</h2>
        <p>Have the coach's replies read aloud. Off by default.</p>
        <VoiceFields profile={profile} llmSetup={llmSetup} />
      </section>

      <section aria-label="Linked accounts" className="card">
        <h2>Linked accounts</h2>
        <p>
          Set these so we can tell which side you played when you import a game — you won&rsquo;t be asked
          again for games from that site.
        </p>
        <LinkedAccountsFields profile={profile} />
      </section>

      <section aria-label="Board" className="card">
        <h2>Board</h2>
        <p>Show dots on the squares a selected piece can legally move to.</p>
        <button type="button" aria-pressed={showLegalMoveDots} onClick={() => setShowLegalMoveDots(true)}>
          Show
        </button>
        <button type="button" aria-pressed={!showLegalMoveDots} onClick={() => setShowLegalMoveDots(false)}>
          Hide
        </button>
      </section>

      <section id="settings-engine" aria-label="Engine" className="card">
        <h2>Engine</h2>
        <EngineFields profile={profile} />
      </section>

      <section id="settings-api-keys" aria-label="API keys" className="card">
        <h2>AI setup</h2>
        <p>Your endpoint and API key are tested, encrypted with your unlock phrase, and kept available only while you are active. We never show the key again.</p>
        <AiSetupHelp />
        <LlmSetupSection status={llmSetup} />
      </section>

      <section aria-label="Appearance" className="card">
        <h2>Appearance</h2>
        <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
          Light
        </button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
          Dark
        </button>
      </section>

      <section aria-label="Account" className="card">
        <h2>Account</h2>
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
      </section>

      <footer className="settings-page__legal">
        {/* /privacy and /terms are static, unauthenticated pages
         * (apps/web/public/) — plain links, not client-side routes. */}
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
      </footer>
    </div>
  );
}
