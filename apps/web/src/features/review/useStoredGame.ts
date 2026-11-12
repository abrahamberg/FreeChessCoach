import { PromoteGameResponseSchema, UserProfileSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client.js';
import { toClassifiedMoves } from '../session/liveMoveQualities.js';
import { GameDetailSchema, type GameDetail } from '../session/sessionPageSchemas.js';
import type { ReviewedGame } from './reviewed-game.js';

const SessionSummarySchema = z.object({ id: z.string() });

/** A stored game for Game Review (GET /api/games/:id, the same endpoint the
 * Games list's detail fetch uses), the coach the account picked, and
 * "Continue with Coach", the page's one mutation. */
export function useStoredGame(gameId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gameQuery = useQuery({
    queryKey: ['game', gameId],
    queryFn: ({ signal }) => apiGet(`/api/games/${gameId}`, GameDetailSchema, signal),
    enabled: gameId !== ''
  });

  // Same query key useSessionPageData.ts/SettingsPage.tsx use (TanStack Query
  // dedupes/shares the cache) — this is only the coach's selected persona,
  // for MoveNoteCard's avatar (coaches.md), same as the live chat's own
  // per-message avatar.
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });

  // "Continue with Coach" — promotes the game to the top of the stack, then
  // reuses GamesPage's own find-or-create flow (POST /api/sessions) so an
  // existing session for this game is resumed rather than shadowed. One
  // mutation, not two chained ones: `mutate()` (never `mutateAsync()` with
  // no catch at the call site) keeps a promote/session failure from becoming
  // an unhandled promise rejection, and skipping the promote call once the
  // game is already at the coach tier means a session-creation failure can
  // be retried without re-promoting into a guaranteed second 400.
  const continueWithCoachMutation = useMutation({
    mutationFn: async () => {
      if (gameQuery.data?.reviewTier !== 'coach') {
        await apiPost(`/api/games/${gameId}/promote`, { tier: 'coach' }, PromoteGameResponseSchema);
        void queryClient.invalidateQueries({ queryKey: ['games'] });
        void queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      }
      return apiPost('/api/sessions', { gameId }, SessionSummarySchema);
    },
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  return {
    gameQuery,
    coachPersona: profileQuery.data?.coachPersona ?? 'general',
    continueWithCoach: () => continueWithCoachMutation.mutate(),
    isContinuingWithCoach: continueWithCoachMutation.isPending,
    continueWithCoachError: continueWithCoachMutation.isError
  };
}

/** The stored game as Game Review reads it. Prefer the Game Report's own
 * moves — enrichWithPhaseAndTactics (build-game-report.ts) enriches them
 * with phase/tacticOpportunity/reasons on top of whatever
 * `classifiedMoves`/`liveMoveQualities` already has, so it's a strict
 * superset once it exists. This matters most for a `vs_bot` game: the route
 * always returns `classifiedMoves: null` for that source (liveMoveQualities
 * is its in-progress shape), so without this a finished, analyzed bot game
 * would show only bare quality badges — no bestMoveSan/reasons/alternatives
 * — despite a full report already sitting in `gameReport`. */
export function toReviewedGame(game: GameDetail): ReviewedGame {
  const classifiedMoves = game.gameReport
    ? game.gameReport.moves
    : game.liveMoveQualities
      ? toClassifiedMoves(game.liveMoveQualities)
      : (game.classifiedMoves ?? []);
  return {
    pgn: game.pgn,
    userColor: game.userColor,
    whiteName: game.whiteName,
    blackName: game.blackName,
    result: game.result,
    classifiedMoves,
    gameReport: game.gameReport,
    tacticBaseline: game.tacticBaseline
  };
}
