import { parsePgn } from '@freechesscoach/chess-analysis';
import { PromoteGameResponseSchema } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { sanToSquares } from '../board/sanToSquares.js';
import { toClassifiedMoves } from '../session/liveMoveQualities.js';
import { GameDetailSchema } from '../session/sessionPageSchemas.js';
import { lastMoveHighlightsFor } from '../session/useSessionBoardState.js';

const SessionSummarySchema = z.object({ id: z.string() });

function splitUci(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

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

  // Same pattern as the coaching session's own show_position preMove
  // (useSessionBoardState's isAnchoredPreMove/revealPlayedMove): the board
  // defaults to the position BEFORE the move under discussion — the arrows
  // below (what was played vs. what the engine preferred) are both legal
  // moves from THAT position, not from the position after — with an
  // explicit reveal to see the actual result. Resets on every move change,
  // since "revealed" is about the one comparison being looked at, not a
  // standing preference; this also doubles as how the game's true final
  // position (e.g. checkmate) stays reachable — reveal the last move.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => setRevealed(false), [ply]);
  const isAnchoredPreMove = ply > 0 && !revealed;
  const boardPly = isAnchoredPreMove ? ply - 1 : ply;

  const boardPosition = positions.find((position) => position.ply === boardPly) ?? positions[0];
  const fen = boardPosition?.fen ?? '';
  const playedMoveUci = positions.find((position) => position.ply === ply)?.moveUci;

  const arrows: BoardArrow[] = [];
  const highlights = isAnchoredPreMove ? [] : lastMoveHighlightsFor(boardPosition?.moveUci);
  if (isAnchoredPreMove && playedMoveUci) {
    arrows.push({ ...splitUci(playedMoveUci), color: 'var(--played-move)' });
    if (currentMove?.bestMoveSan && currentMove.bestMoveSan !== currentMove.moveSan) {
      const best = sanToSquares(fen, currentMove.bestMoveSan);
      if (best) arrows.push({ ...best, color: 'var(--quality-best)' });
    }
  }

  function revealPlayedMove(): void {
    setRevealed(true);
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
    isAnchoredPreMove,
    revealPlayedMove,
    continueWithCoach,
    isContinuingWithCoach: continueWithCoachMutation.isPending,
    continueWithCoachError: continueWithCoachMutation.isError
  };
}
