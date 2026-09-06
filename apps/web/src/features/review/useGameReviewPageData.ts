import { parsePgn } from '@freechesscoach/chess-analysis';
import { PromoteGameResponseSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client.js';
import { toClassifiedMoves } from '../session/liveMoveQualities.js';
import { GameDetailSchema } from '../session/sessionPageSchemas.js';
import { lastMoveHighlightsFor } from '../session/useSessionBoardState.js';

const SessionSummarySchema = z.object({ id: z.string() });

/** All fetching + derived state for the standalone Game Review page
 * (AGENTS.md rule 7) — GameReviewPage itself stays presentational. Unlike
 * useSessionPageData, there is no session/chat here at all: this reads a
 * game's stored analysis directly (GET /api/games/:id, the same endpoint
 * the Games list's detail fetch already uses) and just lets the student
 * step through it move by move — no coach turn, no LLM call. */
export function useGameReviewPageData(gameId: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ply, setPly] = useState(0);

  const gameQuery = useQuery({
    queryKey: ['game', gameId],
    queryFn: ({ signal }) => apiGet(`/api/games/${gameId}`, GameDetailSchema, signal),
    enabled: gameId !== ''
  });

  const positions = gameQuery.data ? parsePgn(gameQuery.data.pgn).positions : [];
  const sanMoves = positions.filter((position) => position.moveSan !== null).map((position) => position.moveSan as string);
  const classifiedMoves = gameQuery.data?.liveMoveQualities
    ? toClassifiedMoves(gameQuery.data.liveMoveQualities)
    : (gameQuery.data?.classifiedMoves ?? []);

  const currentPosition = positions.find((position) => position.ply === ply) ?? positions[0];
  const fen = currentPosition?.fen ?? '';
  const highlights = lastMoveHighlightsFor(currentPosition?.moveUci);

  // "Continue with Coach" — promotes the game to the top of the stack, then
  // reuses GamesPage's own find-or-create flow (POST /api/sessions) so an
  // existing session for this game is resumed rather than shadowed.
  const promoteMutation = useMutation({
    mutationFn: () => apiPost(`/api/games/${gameId}/promote`, { tier: 'coach' }, PromoteGameResponseSchema)
  });
  const sessionMutation = useMutation({
    mutationFn: () => apiPost('/api/sessions', { gameId }, SessionSummarySchema),
    onSuccess: (session) => navigate(`/session/${session.id}`)
  });

  async function continueWithCoach(): Promise<void> {
    await promoteMutation.mutateAsync();
    void queryClient.invalidateQueries({ queryKey: ['games'] });
    sessionMutation.mutate();
  }

  return {
    gameQuery,
    positions,
    sanMoves,
    classifiedMoves,
    ply,
    setPly,
    fen,
    highlights,
    continueWithCoach,
    isContinuingWithCoach: promoteMutation.isPending || sessionMutation.isPending,
    continueWithCoachError: promoteMutation.isError || sessionMutation.isError
  };
}
