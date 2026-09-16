import { parsePgn } from '@freechesscoach/chess-analysis';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { useWasmEngine } from '../../hooks/useWasmEngine.js';
import type { BotGameOverInfo } from './botGameOver.js';
import { toClassifiedMoves } from './liveMoveQualities.js';
import {
  ClaimBotTimeoutResponseSchema,
  GameDetailSchema,
  ResignBotGameResponseSchema,
  SessionDetailSchema,
  UndoBotMoveResponseSchema
} from './sessionPageSchemas.js';
import { useBotTurnFailover } from './useBotTurnFailover.js';
import { useDivergedLine } from './useDivergedLine.js';
import { useLivePositions } from './useLivePositions.js';
import { useSessionBoardState } from './useSessionBoardState.js';

export interface BotClockState {
  whiteRemainingMs: number;
  blackRemainingMs: number;
  /** Date.now() when these values were last known server-authoritative —
   * see ClockDisplay's own doc comment. */
  anchoredAt: number;
}

const FALLBACK_POSITION = { ply: 0, fen: '', moveSan: null, moveUci: null, mover: null };

/** Odd plies are White's (ply 1 = White's 1st move), matching
 * play-moves.ts's `applied.ply % 2 === 1 ? 'white' : 'black'`. */
function moverForPly(ply: number): 'white' | 'black' {
  return ply % 2 === 1 ? 'white' : 'black';
}

/**
 * All fetching + derived state for a play_bot session ("Play vs Bot" plan) —
 * BotSessionPage stays a presentational composer over this, same split
 * useSessionPageData.ts uses for analyze/play. Deliberately does NOT
 * construct useCoachChat: a bot session has no chat/SSE turn lifecycle at
 * all, so building that machinery here would be dead weight.
 */
export function useBotSessionPageData(sessionId: string) {
  const queryClient = useQueryClient();

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: ({ signal }) => apiGet(`/api/sessions/${sessionId}`, SessionDetailSchema, signal),
    enabled: sessionId !== ''
  });

  const gameId = sessionQuery.data?.gameId;
  const gameQuery = useQuery({
    queryKey: ['game', gameId],
    queryFn: ({ signal }) => apiGet(`/api/games/${gameId}`, GameDetailSchema, signal),
    enabled: gameId !== undefined
  });

  const basePositions = gameQuery.data ? parsePgn(gameQuery.data.pgn).positions : [];
  // A bot game's positions grow move-by-move, same as play mode — seed is
  // withheld (undefined) until gameQuery.data resolves, so useLivePositions
  // (which seeds itself exactly once) never gets permanently stranded on an
  // empty starting position.
  const livePositions = useLivePositions(gameQuery.data ? basePositions : undefined);
  const positions = livePositions.positions;
  const classifiedMoves = gameQuery.data?.liveMoveQualities
    ? toClassifiedMoves(gameQuery.data.liveMoveQualities)
    : (gameQuery.data?.classifiedMoves ?? null);
  const sanMoves = positions.filter((position) => position.moveSan !== null).map((position) => position.moveSan as string);

  const initialPly = sessionQuery.data?.subjectPly;
  const boardState = useSessionBoardState(positions, initialPly);
  const divergedLine = useDivergedLine();
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);
  // boardState.coachPly, not boardState.ply: peekAt (move-list/Explore
  // navigation) reassigns `ply` for local-only display, but the failover
  // poll below needs to know where the game *actually* is regardless of
  // what the student is currently looking at.
  const currentRealPosition =
    positions.find((position) => position.ply === boardState.coachPly) ?? positions[0] ?? FALLBACK_POSITION;
  const engine = useWasmEngine();

  // Seeded once the game loads (a timed game's initial remaining time), then
  // owned by handleClockUpdate after every move — same "arrives after
  // mount, seed via effect once" pattern as useLivePositions' own seed.
  const [clock, setClock] = useState<BotClockState | null>(null);
  const clockSeededRef = useRef(false);
  useEffect(() => {
    if (clockSeededRef.current || !gameQuery.data) return;
    clockSeededRef.current = true;
    const { clockInitialMs, whiteRemainingMs, blackRemainingMs } = gameQuery.data;
    if (clockInitialMs !== null && whiteRemainingMs !== null && blackRemainingMs !== null) {
      setClock({ whiteRemainingMs, blackRemainingMs, anchoredAt: Date.now() });
    }
  }, [gameQuery.data]);

  function handleClockUpdate(whiteRemainingMs: number | null, blackRemainingMs: number | null): void {
    if (whiteRemainingMs === null || blackRemainingMs === null) return;
    setClock({ whiteRemainingMs, blackRemainingMs, anchoredAt: Date.now() });
  }

  // Set the moment any of the four ways a bot game can end reports one
  // (checkmate/draw via a play-move response, a recovered bot reply via
  // useBotTurnFailover, a clock claim, or the student's own resignation) —
  // BotSessionPage reads this to show GameOverDialog/BotStatusPanel's result
  // line without waiting on a session refetch, and to know a completion just
  // happened live rather than being a cold-loaded already-finished game (see
  // its own doc comment on why that distinction matters).
  const [gameOverInfo, setGameOverInfo] = useState<BotGameOverInfo | null>(null);

  /** commitBotTurn/requestBotMove/claimBotGameTimeout have already marked the
   * session completed server-side by the time this fires — refetching just
   * picks that up. */
  function handleGameOver(gameOver: BotGameOverInfo): void {
    setGameOverInfo(gameOver);
    void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  }

  // ClockDisplay's own "my countdown hit 0" trigger — see
  // bot-claim-timeout.ts for why the server re-verifies rather than trusting
  // this client-side call outright.
  const claimTimeoutMutation = useMutation({
    mutationFn: () => apiPost(`/api/sessions/${sessionId}/claim-timeout`, {}, ClaimBotTimeoutResponseSchema),
    onSuccess: (result) => {
      if (result.gameOver) handleGameOver(result.gameOver);
    }
  });

  function handleBotMoveCommitted(result: { fen: string; san: string; ply: number }, uci: string): void {
    livePositions.append({
      ply: result.ply,
      fen: result.fen,
      moveSan: result.san,
      moveUci: uci,
      mover: moverForPly(result.ply)
    });
    boardState.applyServerMove(result.ply, result.fen, uci);
    // The server already classified this move and persisted its evalAfterCp
    // (commitBotTurn's classifyAndRecordMove) — nothing in the play-move
    // response surfaces it directly, so pick it up the same way handleGameOver
    // picks up session completion: invalidate and let the next gameQuery
    // refetch bring gameQuery.data.liveMoveQualities current. Fires once for
    // the student's move and once for the bot's reply (this callback runs
    // for both) — a harmless extra refetch, not a race, since TanStack Query
    // dedupes concurrent fetches for the same key. Without this, EvalBar and
    // every other classifiedMoves-driven indicator (MoveStrip, GameEvalChart)
    // stay frozen at whatever they showed when the page first loaded.
    void queryClient.invalidateQueries({ queryKey: ['game', gameId] });
  }

  // "Whose turn is it really" — currentRealPosition, not boardState.ply,
  // since the student can be peeking at history while still waiting on the
  // bot (same distinction BotSessionPage's own `activeColor` draws).
  const studentColor = gameQuery.data?.userColor;
  const isBotTurn = studentColor !== undefined && moverForPly(currentRealPosition.ply + 1) !== studentColor;
  useBotTurnFailover({
    sessionId,
    isActive: sessionQuery.data?.status === 'active',
    isBotTurn,
    currentFen: currentRealPosition.fen,
    onBotMoveCommitted: handleBotMoveCommitted,
    onClockUpdate: handleClockUpdate,
    onGameOver: handleGameOver
  });

  function peekAt(ply: number): void {
    divergedLine.exit();
    boardState.peekAt(ply);
  }

  // No coach tool mediates undo here (unlike 'play' mode's undo_last_move) —
  // this is the bot page's own standalone "Undo" button.
  const undoMutation = useMutation({
    mutationFn: () => apiPost(`/api/sessions/${sessionId}/undo-bot-move`, {}, UndoBotMoveResponseSchema),
    onSuccess: (result) => {
      divergedLine.exit();
      livePositions.truncateTo(result.ply);
      boardState.applyServerMove(result.ply, result.fen);
    }
  });

  // The "flag" button — ends the game immediately as a loss for the
  // student. Reuses the same completed-session path checkmate/stalemate
  // endings already take (handleGameOver flips session.status to
  // 'completed' and surfaces the result) — the endpoint itself has no
  // "reason" field (unlike a play-move response's gameOver), but resigning
  // is the only way this mutation ever fires, so it's supplied here.
  const resignMutation = useMutation({
    mutationFn: () => apiPost(`/api/sessions/${sessionId}/resign`, {}, ResignBotGameResponseSchema),
    onSuccess: (result) => handleGameOver({ result: result.result, reason: 'resignation' })
  });

  return {
    sessionQuery,
    gameQuery,
    sanMoves,
    positions,
    classifiedMoves,
    boardState,
    divergedLine,
    currentRealPosition,
    peekAt,
    autoplayIntervalMs,
    setAutoplayIntervalMs,
    engine,
    handleBotMoveCommitted,
    handleGameOver,
    gameOverInfo,
    undoLastMove: () => undoMutation.mutate(),
    canUndo: sanMoves.length > 0 && !undoMutation.isPending,
    resign: () => resignMutation.mutate(),
    isResigning: resignMutation.isPending,
    clock,
    onClockUpdate: handleClockUpdate,
    claimTimeout: () => claimTimeoutMutation.mutate()
  };
}
