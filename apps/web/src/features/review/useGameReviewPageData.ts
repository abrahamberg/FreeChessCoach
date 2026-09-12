import { parsePgn } from '@freechesscoach/chess-analysis';
import { PromoteGameResponseSchema, UserProfileSchema, type MoveQuality } from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiGet, apiPost } from '../../api/client.js';
import type { BoardArrow } from '../board/CoachBoard.js';
import { sanToSquares } from '../board/sanToSquares.js';
import { tacticSelectionOverlay, toggleTacticSelection, type TacticSelectionKey } from '../board/tacticSelection.js';
import { toClassifiedMoves } from '../session/liveMoveQualities.js';
import { GameDetailSchema } from '../session/sessionPageSchemas.js';
import { lastMoveHighlightsFor } from '../session/useSessionBoardState.js';

const SessionSummarySchema = z.object({ id: z.string() });

/** MoveQualityBadgeOverlay's on-board badge for the current ply — the
 * square the move landed on plus its quality tier, or `undefined` to draw
 * nothing — see that component's own doc comment. One combined value (not
 * a square alone that CoachBoard then has to re-pair with the move's
 * quality) since the two only ever mean anything together. Exported for
 * direct unit testing rather than only through the whole hook. */
export function moveQualityBadgeFor(
  quality: MoveQuality | undefined,
  moveUci: string | null | undefined
): { square: string; quality: MoveQuality } | undefined {
  if (!quality || !moveUci) return undefined;
  return { square: moveUci.slice(2, 4), quality };
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
  // Which tactic sentence's arrow (if any) MoveNoteCard has selected —
  // reset on every ply change (Daniel's call: "moving to next move resets
  // the arrows"), regardless of which nav control changed it (MoveNavPills,
  // MoveStrip, MoveExplorer, or the board's own move-list clicks all funnel
  // through `setPly`). Reset inline during render (the "adjusting state
  // when a prop changes" pattern), not in a useEffect: an effect only runs
  // after the ply-changed render has already committed and painted, so for
  // one frame `tacticSelection` would still be the old ply's key applied
  // against the new ply's tactic data — exactly the stale-arrow flash this
  // is meant to prevent.
  const [tacticSelectionPly, setTacticSelectionPly] = useState(ply);
  const [tacticSelection, setTacticSelection] = useState<TacticSelectionKey>(null);
  if (ply !== tacticSelectionPly) {
    setTacticSelectionPly(ply);
    setTacticSelection(null);
  }
  function toggleTacticSelectionKey(key: Exclude<TacticSelectionKey, null>): void {
    setTacticSelection((current) => toggleTacticSelection(current, key));
  }

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
  const coachPersona = profileQuery.data?.coachPersona ?? 'general';

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
  // The selected tactic sentence's own geometry (tacticSelectionOverlay) on
  // top of the last-move highlight — both are just square/color pairs the
  // board merges the same way, so there's nothing to reconcile between them.
  const tacticOverlay = tacticSelectionOverlay(currentMove, tacticSelection);
  const highlights = [...lastMoveHighlightsFor(currentPosition?.moveUci), ...tacticOverlay.highlights];
  // Every classified move gets its quality badge echoed on the board too,
  // on the square it landed on — see MoveQualityBadgeOverlay.
  const moveQualityBadge = moveQualityBadgeFor(currentMove?.quality, currentPosition?.moveUci);

  // The one visual for "what was actually best" — MoveNoteCard no longer
  // spells it out as a "Best: <line>" sentence (Daniel's call: obvious once
  // it's drawn). bestMoveSan is resolved against fenBefore (the position
  // the choice was actually made from) purely to get its from/to squares;
  // the arrow itself is drawn on `fen` above, the real current position, so
  // its origin square won't always still hold the piece it names — an
  // accepted trade-off of never replaying a "before" state to show it on.
  // --annotate-2 (blue) rather than any --quality-* color, so it never
  // reads as a quality judgment the way the note card's own accent border
  // does — it's a suggestion, not a verdict.
  const arrows: BoardArrow[] = [...tacticOverlay.arrows];
  if (currentMove?.bestMoveSan && currentMove.bestMoveSan !== currentMove.moveSan && currentMove.fenBefore) {
    const best = sanToSquares(currentMove.fenBefore, currentMove.bestMoveSan);
    if (best) arrows.push({ from: best.from, to: best.to, color: 'var(--annotate-2)' });
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
    moveQualityBadge,
    coachPersona,
    tacticSelection,
    onToggleTacticSelection: toggleTacticSelectionKey,
    continueWithCoach,
    isContinuingWithCoach: continueWithCoachMutation.isPending,
    continueWithCoachError: continueWithCoachMutation.isError
  };
}
