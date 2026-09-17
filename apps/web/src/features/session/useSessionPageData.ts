import { parsePgn, resolveSanMove } from '@freechesscoach/chess-analysis';
import { UserProfileSchema } from '@freechesscoach/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client.js';
import { DEFAULT_AUTOPLAY_INTERVAL_MS } from '../board/useLineAutoplay.js';
import { useCoachChat, type CoachToolCall } from '../../hooks/useCoachChat.js';
import { useUnlockLlmSetup } from '../../hooks/useUnlockLlmSetup.js';
import { toClassifiedMoves } from './liveMoveQualities.js';
import { toCoachMessages } from './sessionMessages.js';
import { GameDetailSchema, ResetSessionResponseSchema, SessionDetailSchema } from './sessionPageSchemas.js';
import { useDivergedLine } from './useDivergedLine.js';
import { useLivePositions } from './useLivePositions.js';
import { useSessionBoardState, type UseSessionBoardStateResult } from './useSessionBoardState.js';

const FALLBACK_POSITION = { ply: 0, fen: '', moveSan: null, moveUci: null, mover: null };

interface PlayCoachMoveOutput {
  fen: string;
  san: string;
  ply: number;
}

interface UndoLastMoveOutput {
  fen: string;
  removedPly: number;
}

/** Both play_coach_move and undo_last_move resolve to `{ error: string }` on
 * a server-side rejection (an illegal move, "no move to undo") instead of
 * their normal success shape — this must be checked before touching the
 * board, or `output.fen`/`output.ply` read off the error shape come back
 * `undefined` and get written straight into `positions`/`boardState` (see
 * handleServerToolResult below), corrupting the board's fen for the rest of
 * the session (react-chessboard fed `''`) until a hard reload rebuilds it
 * from the server's own truth. */
function isErrorOutput(output: unknown): boolean {
  return typeof output === 'object' && output !== null && 'error' in output;
}

/** Odd plies are White's (ply 1 = White's 1st move), matching
 * play-moves.ts's `applied.ply % 2 === 1 ? 'white' : 'black'`. */
function moverForPly(ply: number): 'white' | 'black' {
  return ply % 2 === 1 ? 'white' : 'black';
}

/** architecture §14: the coach's own play_coach_move tool result — same
 * board-side consequences as the student's POST /play-move (see
 * SessionBoardColumn's handlePlayMove), but the response has no moveUci of
 * its own, so it's derived from the position right before this move. */
function applyPlayCoachMove(
  boardState: UseSessionBoardStateResult,
  livePositions: ReturnType<typeof useLivePositions>,
  fenBeforeMove: string,
  output: PlayCoachMoveOutput
): void {
  const resolved = resolveSanMove(fenBeforeMove, output.san);
  const moveUci = resolved ? `${resolved.from}${resolved.to}` : null;
  livePositions.append({
    ply: output.ply,
    fen: output.fen,
    moveSan: output.san,
    moveUci,
    mover: moverForPly(output.ply)
  });
  boardState.applyServerMove(output.ply, output.fen, moveUci);
}

/** architecture §14: undo_last_move pops the game's last move — trims the
 * positions array back down rather than appending. `removedPly` names the
 * ply that was POPPED (play-moves.ts's UndoResult — same convention
 * bot-undo.ts and coach-agent-turn.ts's advancePlyForPlayMove already use,
 * both via `removedPly - 1`), NOT the ply the game is left at — `output.fen`
 * is the position one ply earlier, after the undo. Using `removedPly` as-is
 * here left the popped move's own (now-stale) entry sitting in `positions`
 * (truncateTo's `<=` kept it) and pointed the board's `ply` state at it too,
 * so `positions.find` resolved back to the pre-undo position instead of
 * ever reaching applyServerMove's fen/pendingServerPosition fallback — the
 * undo silently did nothing on the board. */
function applyUndoLastMove(
  boardState: UseSessionBoardStateResult,
  livePositions: ReturnType<typeof useLivePositions>,
  output: UndoLastMoveOutput
): void {
  const ply = output.removedPly - 1;
  livePositions.truncateTo(ply);
  boardState.applyServerMove(ply, output.fen);
}

/** All fetching + derived state for the session page (AGENTS.md rule 7) —
 * SessionPage itself stays a presentational composer over this. */
export function useSessionPageData(sessionId: string) {
  const navigate = useNavigate();

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: ({ signal }) => apiGet(`/api/sessions/${sessionId}`, SessionDetailSchema, signal),
    enabled: sessionId !== ''
  });

  // Same query key SettingsPage.tsx uses (TanStack Query dedupes/shares the
  // cache) — this is the coach's selected persona, for the chat avatar
  // (coaches.md).
  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) => apiGet('/api/users/me', UserProfileSchema, signal)
  });

  const gameId = sessionQuery.data?.gameId;
  const gameQuery = useQuery({
    queryKey: ['game', gameId],
    queryFn: ({ signal }) => apiGet(`/api/games/${gameId}`, GameDetailSchema, signal),
    enabled: gameId !== undefined
  });

  const isPlayMode = sessionQuery.data?.mode === 'play';
  const basePositions = gameQuery.data ? parsePgn(gameQuery.data.pgn).positions : [];
  // architecture §14: play mode's positions grow move-by-move instead of
  // coming once from the (mostly-empty) PGN a fresh play game starts with.
  // Seed is withheld (undefined) until gameQuery.data actually resolves —
  // useLivePositions seeds itself exactly once, so passing `[]` while the
  // game is still loading would permanently strand the board with no
  // starting position once the real one arrives.
  const livePositions = useLivePositions(isPlayMode && gameQuery.data ? basePositions : undefined);
  const positions = isPlayMode ? livePositions.positions : basePositions;
  const classifiedMoves = gameQuery.data?.liveMoveQualities
    ? toClassifiedMoves(gameQuery.data.liveMoveQualities)
    : (gameQuery.data?.classifiedMoves ?? null);
  const sanMoves = positions.filter((position) => position.moveSan !== null).map((position) => position.moveSan as string);

  // subjectPly (not a scan for the last show_position, which could be a
  // trailing flashback) — see sessionPageSchemas.ts's SessionDetailSchema.
  const initialPly = sessionQuery.data?.subjectPly;
  const boardState = useSessionBoardState(positions, initialPly);
  const divergedLine = useDivergedLine();
  const [autoplayIntervalMs, setAutoplayIntervalMs] = useState(DEFAULT_AUTOPLAY_INTERVAL_MS);
  const currentRealPosition =
    positions.find((position) => position.ply === boardState.ply) ?? positions[0] ?? FALLBACK_POSITION;
  const initialMessages =
    sessionQuery.data && gameQuery.data ? toCoachMessages(sessionQuery.data.messages, sanMoves) : undefined;

  // Disjoint tool ownership — divergedLine owns expect_move/hypothetical_line
  // and exits on a real show_position; boardState owns show_position/
  // annotate_board — so exactly one of these ever returns a defined result.
  function handleCoachToolCall(toolCall: CoachToolCall): unknown {
    const real = { ply: currentRealPosition.ply, fen: currentRealPosition.fen };
    const hypotheticalResult = divergedLine.handleToolCall(toolCall, real, positions);
    const boardResult = boardState.handleToolCall(toolCall);
    return boardResult ?? hypotheticalResult;
  }

  // architecture §14: play_coach_move/undo_last_move resolve mid-stream with
  // no client round-trip (see useCoachChat's onServerToolResult) — this is
  // their board-side consequence, symmetric with handlePlayMoveCommitted
  // below for the student's own move.
  function handleServerToolResult(toolName: string, output: unknown): void {
    if (toolName === 'play_coach_move') {
      if (isErrorOutput(output)) {
        // The coach tried to play an illegal move — the game (and the
        // board) stay exactly where they were; nothing to apply. Logged
        // since this is otherwise invisible on the client (see
        // isErrorOutput's doc comment for what silently applying it here
        // used to do to the board).
        console.error('play_coach_move rejected:', (output as { error: string }).error);
        return;
      }
      applyPlayCoachMove(boardState, livePositions, currentRealPosition.fen, output as PlayCoachMoveOutput);
      return;
    }
    if (toolName === 'undo_last_move' && !isErrorOutput(output)) {
      applyUndoLastMove(boardState, livePositions, output as UndoLastMoveOutput);
    }
  }

  // architecture §14: the student's own move, committed via POST
  // /play-move (SessionBoardColumn) before the follow-up chat turn starts.
  function handlePlayMoveCommitted(result: { fen: string; san: string; ply: number }, uci: string): void {
    livePositions.append({
      ply: result.ply,
      fen: result.fen,
      moveSan: result.san,
      moveUci: uci,
      mover: moverForPly(result.ply)
    });
    boardState.applyServerMove(result.ply, result.fen, uci);
  }

  function peekAt(ply: number): void {
    divergedLine.exit();
    boardState.peekAt(ply);
  }

  // Opens the moment a coaching turn fails because AI is locked (see
  // useCoachChat's onUnlockRequired) — the popup's own onUnlock/feedback
  // state comes from this same shared hook Settings uses, so both places
  // give identical correct/wrong/checking feedback.
  const unlock = useUnlockLlmSetup();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const pendingRetryRef = useRef<(() => Promise<void>) | null>(null);
  const handleUnlockRequired = useCallback((retry: () => Promise<void>) => {
    pendingRetryRef.current = retry;
    setShowUnlockModal(true);
  }, []);

  const chat = useCoachChat(sessionId, {
    onToolCall: handleCoachToolCall,
    onServerToolResult: handleServerToolResult,
    onUnlockRequired: handleUnlockRequired,
    initialMessages,
    sanMoves
  });

  const unlockModal = {
    isOpen: showUnlockModal,
    isPending: unlock.isPending,
    isSuccess: unlock.isSuccess,
    errorMessage: unlock.errorMessage,
    onUnlock: unlock.unlock,
    onClose: () => {
      setShowUnlockModal(false);
      unlock.reset();
    },
    onUnlocked: () => {
      setShowUnlockModal(false);
      unlock.reset();
      const retry = pendingRetryRef.current;
      pendingRetryRef.current = null;
      void retry?.();
    }
  };

  // A fresh session has only the internal [session_start] marker persisted
  // at creation (coach-agent.ts) — nothing has ever triggered a model turn
  // on it, so the coach otherwise never speaks until the student does.
  const kickedOffRef = useRef(false);
  useEffect(() => {
    const messages = sessionQuery.data?.messages;
    if (!kickedOffRef.current && messages && gameQuery.data && sessionQuery.data?.status === 'active') {
      if (!messages.some((message) => message.role === 'assistant')) {
        kickedOffRef.current = true;
        void chat.kickoff();
      }
    }
  }, [sessionQuery.data, chat]);

  const resetMutation = useMutation({
    mutationFn: () => apiPost(`/api/sessions/${sessionId}/reset`, {}, ResetSessionResponseSchema),
    onSuccess: (freshSession) => navigate(`/session/${freshSession.id}`)
  });

  function handleReset(): void {
    if (window.confirm('Reset this session? This ends the current conversation and starts a fresh one for this game.')) {
      resetMutation.mutate();
    }
  }

  return {
    sessionQuery,
    profileQuery,
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
    chat,
    unlockModal,
    handleReset,
    handlePlayMoveCommitted
  };
}
