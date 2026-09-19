import { PromoteGameResponseSchema, isTopReviewTier, type GameListItem } from '@freechesscoach/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiDelete, apiPost } from '../../api/client.js';
import { useLlmSetupStatus } from '../../hooks/useLlmSetupStatus.js';

const SessionSummarySchema = z.object({ id: z.string() });
const AnalyzeResponseSchema = z.object({ analysisId: z.string() });

export interface AiSetupPrompt {
  gameId: string;
  onClose: () => void;
  onGoToSettings: () => void;
  onAnalyzeInstead: () => void;
}

/** Every per-game action the Games page and Find games share — Review,
 * Coach, Continue, Analyze, Delete, PGN export/copy — so the two pages'
 * cards and rows behave identically. `games` is whatever the caller is
 * currently showing; handlers take a game id (the cards'/rows' own
 * callback shape) and look it up here. Owns the mutations (AGENTS.md rule
 * 7: fetching lives in hooks, not components). */
export function useGameActions(games: GameListItem[]) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const llmSetupQuery = useLlmSetupStatus();
  const [setupRequiredGameId, setSetupRequiredGameId] = useState<string | null>(null);

  const findGame = (gameId: string) => games.find((candidate) => candidate.id === gameId);
  const refreshGames = () => queryClient.invalidateQueries({ queryKey: ['games'] });

  // Promotes to the coach tier first when the game hasn't reached it yet (a
  // game already at 'coach' skips straight to opening the session), then
  // finds-or-creates its session.
  const coachMutation = useMutation({
    mutationFn: async (game: GameListItem) => {
      if (!isTopReviewTier(game.reviewTier)) {
        await apiPost(`/api/games/${game.id}/promote`, { tier: 'coach' }, PromoteGameResponseSchema);
        void refreshGames();
      }
      return apiPost('/api/sessions', { gameId: game.id }, SessionSummarySchema);
    },
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  const deleteMutation = useMutation({ mutationFn: (gameId: string) => apiDelete(`/api/games/${gameId}`), onSuccess: refreshGames });

  // Starts analysis for a game imported with deferAnalysis; refreshing flips
  // the card from "Not analyzed" to "Analyzing…" immediately.
  const analyzeMutation = useMutation({
    mutationFn: (gameId: string) => apiPost(`/api/games/${gameId}/analyze`, {}, AnalyzeResponseSchema),
    onSuccess: refreshGames
  });

  // Clipboard needs the PGN as a string — a plain fetch reads GET
  // /api/games/:id/pgn's raw body untouched by its Content-Disposition header.
  const copyPgnMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const response = await fetch(`/api/games/${gameId}/pgn`, { credentials: 'include' });
      if (!response.ok) throw new Error(`GET pgn failed with ${response.status}`);
      await navigator.clipboard.writeText(await response.text());
    }
  });

  // architecture §14: a coach_play/vs_bot game already has its own live
  // session — link straight back into it rather than through analyze mode's
  // gated POST /api/sessions.
  function handleContinue(gameId: string): void {
    const game = findGame(gameId);
    if (!game?.sessionId) return;
    if (game.source === 'coach_play') void navigate(`/session/${game.sessionId}`);
    if (game.source === 'vs_bot') void navigate(`/bot-session/${game.sessionId}`);
  }

  // Coaching needs the student's own AI key: without one, explain that (and
  // offer the free Review) instead of failing after the session opens. While
  // the status is still loading, or if it failed to load, don't block — the
  // server rejects a keyless coaching turn anyway.
  function handleCoach(gameId: string): void {
    const game = findGame(gameId);
    if (!game) return;
    if (llmSetupQuery.data?.configured === false) {
      setSetupRequiredGameId(gameId);
      return;
    }
    coachMutation.mutate(game);
  }

  const aiSetupPrompt: AiSetupPrompt | null =
    setupRequiredGameId === null
      ? null
      : {
          gameId: setupRequiredGameId,
          onClose: () => setSetupRequiredGameId(null),
          onGoToSettings: () => navigate('/settings#settings-api-keys'),
          onAnalyzeInstead: () => navigate(`/review/${setupRequiredGameId}`)
        };

  const errorMessages = [
    deleteMutation.isError && 'Could not delete that game — try again.',
    analyzeMutation.isError && 'Could not start analysis — try again.',
    copyPgnMutation.isError && 'Could not copy the PGN — try again.',
    coachMutation.isError && 'Could not start a coaching session — try again.'
  ].filter((message): message is string => message !== false);

  return {
    handleContinue,
    handleCoach,
    handleReview: (gameId: string) => navigate(`/review/${gameId}`),
    handleAnalyze: (gameId: string) => analyzeMutation.mutate(gameId),
    handleDelete: (gameId: string) => deleteMutation.mutate(gameId),
    // Same-origin GET with Content-Disposition: attachment — a plain
    // navigation carries the session cookie and the browser handles the
    // save-file flow natively.
    handleExportPgn: (gameId: string) => {
      window.location.href = `/api/games/${gameId}/pgn`;
    },
    handleCopyPgn: (gameId: string) => copyPgnMutation.mutate(gameId),
    aiSetupPrompt,
    errorMessages
  };
}
