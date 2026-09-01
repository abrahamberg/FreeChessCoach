import {
  LlmSetupStatusSchema,
  LlmSetupTestResponseSchema,
  type LlmSetup,
  UserProfileSchema,
  type CoachPersona,
  type EngineMode,
  type RatingBand
} from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPostVoid, apiPut } from '../../api/client.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';
import { BandSelect } from './BandSelect.js';
import { LlmSetupForm } from './LlmSetupForm.js';
import { CoachPersonaSelect } from './CoachPersonaSelect.js';
import { EngineModeSelect } from './EngineModeSelect.js';
import { NicknameForm } from './NicknameForm.js';
import { PlatformUsernameForm } from './PlatformUsernameForm.js';
import { TtsSection, type TtsProfilePatch } from './TtsSection.js';
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
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<Theme | null>(() => readStoredTheme());
  const [showLegalMoveDots, setShowLegalMoveDots] = useShowLegalMoveDots();
  const { hash } = useLocation();

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } else {
      delete document.documentElement.dataset.theme;
    }
  }, [theme]);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });
  const llmSetupQuery = useQuery({
    queryKey: ['llm-setup'],
    queryFn: ({ signal }) => apiGet('/api/users/me/llm-setup', LlmSetupStatusSchema, signal)
  });

  // Client-side route changes (e.g. the topbar engine indicator linking to
  // /settings#settings-engine) don't get the browser's native scroll-to-
  // fragment behavior the way a full page load would, so it's done by hand
  // here — gated on isSuccess since the target section only exists in the
  // DOM once the "Loading…" early-return below has passed.
  useEffect(() => {
    if (!hash || !profileQuery.isSuccess) return;
    document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, profileQuery.isSuccess]);

  const displayNameMutation = useMutation({
    mutationFn: (displayName: string) => apiPatch('/api/users/me', { displayName }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const bandMutation = useMutation({
    mutationFn: (ratingBand: RatingBand) => apiPatch('/api/users/me', { ratingBand }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const engineModeMutation = useMutation({
    mutationFn: (engineMode: EngineMode) => apiPatch('/api/users/me', { engineMode }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const coachPersonaMutation = useMutation({
    mutationFn: (coachPersona: CoachPersona) => apiPatch('/api/users/me', { coachPersona }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const lichessUsernameMutation = useMutation({
    mutationFn: (lichessUsername: string | null) =>
      apiPatch('/api/users/me', { lichessUsername }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const chesscomUsernameMutation = useMutation({
    mutationFn: (chesscomUsername: string | null) =>
      apiPatch('/api/users/me', { chesscomUsername }, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const ttsMutation = useMutation({
    mutationFn: (patch: TtsProfilePatch) => apiPatch('/api/users/me', patch, UserProfileSchema),
    onSuccess: (profile) => queryClient.setQueryData(['profile'], profile)
  });

  const testLlmSetupMutation = useMutation({
    mutationFn: (setup: LlmSetup) => apiPost('/api/users/me/llm-setup/test', setup, LlmSetupTestResponseSchema)
  });

  const saveLlmSetupMutation = useMutation({
    mutationFn: ({ setup, unlockPhrase }: { setup: LlmSetup; unlockPhrase: string }) =>
      apiPut('/api/users/me/llm-setup', { ...setup, unlockPhrase }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-setup'] })
  });

  const unlockLlmSetupMutation = useMutation({
    mutationFn: (unlockPhrase: string) => apiPost('/api/users/me/llm-setup/unlock', { unlockPhrase }, LlmSetupStatusSchema),
    onSuccess: (status) => queryClient.setQueryData(['llm-setup'], status)
  });

  const lockLlmSetupMutation = useMutation({
    mutationFn: () => apiPostVoid('/api/users/me/llm-setup/lock'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-setup'] })
  });

  const deleteLlmSetupMutation = useMutation({
    mutationFn: () => apiDelete('/api/users/me/llm-setup'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-setup'] })
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
        <p className="settings-page__description">Manage your profile, coach, and account.</p>
      </header>

      <section aria-label="Profile" className="card">
        <h2>Profile</h2>
        <div className="settings-page__profile-row">
          <span className="settings-page__profile-avatar" aria-hidden="true">
            {profile.displayName.trim()[0]?.toUpperCase() ?? '?'}
          </span>
          <NicknameForm value={profile.displayName} onSave={(displayName) => displayNameMutation.mutate(displayName)} />
        </div>
        <div className="settings-page__field-label">Playing level</div>
        <BandSelect value={profile.ratingBand} onChange={(band) => bandMutation.mutate(band)} />
      </section>

      <section aria-label="Coach" className="card">
        <h2>Coach</h2>
        <p>Pick who coaches you. It's cosmetic — every coach gives the same advice, just in a different voice.</p>
        <CoachPersonaSelect
          value={profile.coachPersona}
          onChange={(coachPersona) => coachPersonaMutation.mutate(coachPersona)}
        />
      </section>

      <section aria-label="Coach voice" className="card">
        <h2>Coach voice</h2>
        <p>Have the coach's replies read aloud. Off by default.</p>
        <TtsSection
          enabled={profile.ttsEnabled}
          backend={profile.ttsBackend}
          onChange={(patch) => ttsMutation.mutate(patch)}
        />
      </section>

      <section aria-label="Linked accounts" className="card">
        <h2>Linked accounts</h2>
        <p>
          Set these so we can tell which side you played when you import a game — you won&rsquo;t be asked
          again for games from that site.
        </p>
        <PlatformUsernameForm
          platform="lichess"
          label="Lichess username"
          value={profile.lichessUsername}
          onSave={(username) => lichessUsernameMutation.mutate(username)}
          onDelete={() => lichessUsernameMutation.mutate(null)}
        />
        <PlatformUsernameForm
          platform="chesscom"
          label="Chess.com username"
          value={profile.chesscomUsername}
          onSave={(username) => chesscomUsernameMutation.mutate(username)}
          onDelete={() => chesscomUsernameMutation.mutate(null)}
        />
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
        <EngineModeSelect value={profile.engineMode} onChange={(mode) => engineModeMutation.mutate(mode)} />
      </section>

      <section aria-label="API keys" className="card">
        <h2>AI setup</h2>
        <p>Your endpoint and API key are tested, encrypted with your unlock phrase, and kept available only while you are active. We never show the key again.</p>
        <LlmSetupForm
          key={`${llmSetup.configured}-${llmSetup.unlocked}-${llmSetup.protocol ?? 'none'}`}
          status={llmSetup}
          onTest={(setup) => testLlmSetupMutation.mutate(setup)}
          onSave={(setup, unlockPhrase) => saveLlmSetupMutation.mutate({ setup, unlockPhrase })}
          onUnlock={(unlockPhrase) => unlockLlmSetupMutation.mutate(unlockPhrase)}
          onLock={() => lockLlmSetupMutation.mutate()}
          onDelete={() => deleteLlmSetupMutation.mutate()}
          testResult={testLlmSetupMutation.data}
          error={setupError(saveLlmSetupMutation.error ?? unlockLlmSetupMutation.error ?? testLlmSetupMutation.error)}
        />
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

function setupError(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : undefined;
  const body = error.body;
  if (typeof body === 'object' && body !== null && 'title' in body && typeof body.title === 'string') return body.title;
  return error.message;
}
