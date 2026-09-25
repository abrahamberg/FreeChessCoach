import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { shouldRetryQuery } from './api/client.js';
import { AppShell } from './components/AppShell.js';
import { TunnelTakeoverGate } from './components/TunnelTakeoverGate.js';
import { FindGamesPage } from './features/games/FindGamesPage.js';
import { GamesPage } from './features/games/GamesPage.js';
import { ImportPage } from './features/import/ImportPage.js';
import { OnboardingPage } from './features/onboarding/OnboardingPage.js';
import { OnboardingRedirect } from './features/onboarding/OnboardingRedirect.js';
import { PlayPage } from './features/play/PlayPage.js';
import { PlayStartPage } from './features/play/PlayStartPage.js';
import { PlayBotStartPage } from './features/play-bot/PlayBotStartPage.js';
import { PuzzleSessionPage } from './features/puzzle-session/PuzzleSessionPage.js';
import { ProgressPage } from './features/progress/ProgressPage.js';
import { GameReviewPage } from './features/review/GameReviewPage.js';
import { BotSessionPage } from './features/session/BotSessionPage.js';
import { SessionPage } from './features/session/SessionPage.js';
import { SettingsPage } from './features/settings/SettingsPage.js';
import { StatsPage } from './features/stats/StatsPage.js';
import { DemoCoachRedirect } from './demo/DemoCoachRedirect.js';
import { DEMO_BASENAME } from './demo/demoMode.js';
import { getDemoRuntime } from './demo/demoRuntime.js';
import { useUnifiedTunnelActivation } from './hooks/useUnifiedTunnelActivation.js';

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

/** Keyed by assignmentId, same remount-on-change reasoning as SessionRoute
 * — PracticeCard can link into a different assignment without an actual
 * route unmount/remount otherwise happening. */
function PracticeRoute(): ReactNode {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  return <PuzzleSessionPage key={assignmentId} />;
}

/** Keyed by gameId, same remount-on-change reasoning as SessionRoute — the
 * Games list's Review tab can link into a different game's review without
 * an actual route unmount/remount otherwise happening. */
function GameReviewRoute(): ReactNode {
  const { gameId } = useParams<{ gameId: string }>();
  return <GameReviewPage key={gameId} />;
}

export function App(): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={getDemoRuntime() ? DEMO_BASENAME : undefined}>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

/** Mounted once at the app root; the demo has no tunnel to keep open. */
function UnifiedTunnel(): null {
  useUnifiedTunnelActivation();
  return null;
}

export function AppRoutes(): ReactNode {

  return (
    <AppShell>
      {!getDemoRuntime() && <UnifiedTunnel />}
      <TunnelTakeoverGate>
        <OnboardingRedirect>
          <Routes>
            <Route path="/welcome" element={<OnboardingPage />} />
            <Route path="/" element={<Navigate to="/games" replace />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/play/new" element={<PlayStartPage />} />
            <Route path="/play-bot/new" element={<PlayBotStartPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/games/find" element={<FindGamesPage />} />
            <Route path="/session/:id" element={<SessionRoute />} />
            <Route path="/bot-session/:id" element={<BotSessionRoute />} />
            <Route path="/review/:gameId" element={<GameReviewRoute />} />
            <Route path="/practice/:assignmentId" element={<PracticeRoute />} />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/dashboard" element={<Navigate to="/progress" replace />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {getDemoRuntime() && <Route path="/coach" element={<DemoCoachRedirect />} />}
          </Routes>
        </OnboardingRedirect>
      </TunnelTakeoverGate>
    </AppShell>
  );
}
