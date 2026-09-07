import { parsePgn } from '@freechesscoach/chess-analysis';
import { PromoteGameResponseSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { sanToSquares } from '../board/sanToSquares.js';
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
  // Prefer the Game Report's own moves — enrichWithPhaseAndTactics
  // (build-game-report.ts) enriches them with phase/tacticOpportunity/reasons
  // on top of whatever `classifiedMoves`/`liveMoveQualities` already has, so
  // it's a strict superset once it exists. This matters most for a `vs_bot`
  // game: the route always returns `classifiedMoves: null` for that source
  // (liveMoveQualities is its in-progress shape), so without this a
  // finished, analyzed bot game would show only bare quality badges — no
  // bestMoveSan/reasons/alternatives — despite a full report already sitting
  // in `gameReport`.
  const classifiedMoves = gameQuery.data?.gameReport
    ? gameQuery.data.gameReport.moves
    : gameQuery.data?.liveMoveQualities
      ? toClassifiedMoves(gameQuery.data.liveMoveQualities)
      : (gameQuery.data?.classifiedMoves ?? []);

  const currentMove = classifiedMoves.find((move) => move.ply === ply);

  // Always the real, actual position (never a "before this move" replay —
  // Daniel's call: the board should never travel anywhere the game didn't
  // actually go). The board itself always tells the truth about what
  // happened; a best-move arrow is only drawn on top of it in the one case
  // where doing so can't mislead — see `arrows` below.
  const currentPosition = positions.find((position) => position.ply === ply) ?? positions[0];
  const fen = currentPosition?.fen ?? '';
  const highlights = lastMoveHighlightsFor(currentPosition?.moveUci);

  // A suggestion arrow drawn on the CURRENT (post-move) board only makes
  // sense when the piece it points from is the same one that actually
  // moved — "this piece went the wrong way" reads fine even though its
  // origin square is empty now; "a totally different piece should have
  // moved" does not, since nothing on the board points at what that would
  // have meant. Both bestMoveSan and the played move are resolved against
  // the same pre-move fen (fenBefore) purely to compare their origin
  // squares — the arrow itself is drawn on `fen` above, not fenBefore.
  const arrows: BoardArrow[] = [];
  if (currentMove?.bestMoveSan && currentMove.bestMoveSan !== currentMove.moveSan && currentMove.fenBefore) {
    const played = sanToSquares(currentMove.fenBefore, currentMove.moveSan);
    const best = sanToSquares(currentMove.fenBefore, currentMove.bestMoveSan);
    if (played && best && played.from === best.from) {
      arrows.push({ from: best.from, to: best.to, color: 'var(--quality-best)' });
    }
  }

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

  function continueWithCoach(): void {
    continueWithCoachMutation.mutate();
  }

  return {
    gameQuery,
    positions,
    sanMoves,
    classifiedMoves,
    currentMove,
    ply,
    setPly,
    fen,
    highlights,
    arrows,
    continueWithCoach,
    isContinuingWithCoach: continueWithCoachMutation.isPending,
    continueWithCoachError: continueWithCoachMutation.isError
  };
}
