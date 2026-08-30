import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { shouldRetryQuery } from './api/client.js';
import { AppShell } from './components/AppShell.js';
import { DashboardPage } from './features/dashboard/DashboardPage.js';
import { GamesPage } from './features/games/GamesPage.js';
import { ImportPage } from './features/import/ImportPage.js';
import { PlayStartPage } from './features/play/PlayStartPage.js';
import { PlayBotStartPage } from './features/play-bot/PlayBotStartPage.js';
import { BotSessionPage } from './features/session/BotSessionPage.js';
import { SessionPage } from './features/session/SessionPage.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { StatsPage } from './features/stats/StatsPage.js';
import { useEngineTunnelActivation } from './hooks/useEngineTunnelActivation.js';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery } } });

/** Resetting a session (see SessionHeader) navigates from /session/:oldId to
 * /session/:newId without a route change, so React Router reuses the same
 * SessionPage instance — its per-session refs/hooks (e.g. the kickoff-once
 * ref) would otherwise carry over stale state. Keying by :id forces a clean
 * remount whenever the session actually changes. */
function SessionRoute(): ReactNode {
  const { id } = useParams<{ id: string }>();
  return <SessionPage key={id} />;
}

/** "Play vs Bot" plan: a play_bot session gets its own route rather than a
 * runtime mode-check inside SessionRoute — every caller that navigates here
 * (PlayBotStartPage's mutation, GamesPage's handleSelect for a `vs_bot` row)
 * already knows it's a bot session at click time, so there's no need to
 * fetch first just to decide which component to render. */
function BotSessionRoute(): ReactNode {
  const { id } = useParams<{ id: string }>();
  return <BotSessionPage key={id} sessionId={id ?? ''} />;
}

export function App(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export function AppRoutes(): ReactNode {
  useEngineTunnelActivation();

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/games" replace />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/play/new" element={<PlayStartPage />} />
        <Route path="/play-bot/new" element={<PlayBotStartPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/session/:id" element={<SessionRoute />} />
        <Route path="/bot-session/:id" element={<BotSessionRoute />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
