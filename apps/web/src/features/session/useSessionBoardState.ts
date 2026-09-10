import { moveRefToPly } from '@freechesscoach/chess-analysis';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardArrow, BoardHighlight } from '../board/CoachBoard.js';
import { useAnnotationLayer, type AnnotationState } from '../board/AnnotationLayer.js';
import type { CoachToolCall } from '../../hooks/useCoachChat.js';

export interface SessionPosition {
  ply: number;
  fen: string;
  moveUci?: string | null;
}

export type BoardMode = 'answer' | 'peek';

export interface UseSessionBoardStateResult {
  fen: string;
  ply: number;
  /** The board's last *actually current* position — set by applyServerMove/
   * anchorHere, untouched by peekAt. Unlike `ply` (which peekAt freely
   * reassigns for local-only move-strip/Explore navigation), this is safe to
   * use as "where the game really is right now" while the student may be
   * peeking at history — see e.g. useBotSessionPageData's isBotTurn. */
  coachPly: number;
  mode: BoardMode;
  setMode: (mode: BoardMode) => void;
  arrows: BoardArrow[];
  highlights: BoardHighlight[];
  setAnnotations: (next: AnnotationState) => void;
  /** True while the board is showing the position BEFORE the move currently
   * being discussed, with a red arrow for the move actually played — set by
   * show_position's own preMove: true (see playedMoveArrowFor). False once
   * revealPlayedMove() has been called, while peeking, or at the game's
   * starting position (nothing to anchor before). */
  isAnchoredPreMove: boolean;
  /** Shows the actual post-move position in place of the pre-move anchor —
   * purely a display flag, does not touch ply/coachPly/mode. */
  revealPlayedMove: () => void;
  /** Immediately reflects a locally-dropped move (react-chessboard is a
   * fully-controlled component with no optimistic state of its own — see
   * CoachBoard's onLocalMove doc comment). Superseded by the next
   * show_position or peekAt navigation, and cleared by clearPreview (undo). */
  previewMove: (fen: string) => void;
  clearPreview: () => void;
  /** Wire directly as useCoachChat's onToolCall. */
  handleToolCall: (toolCall: CoachToolCall) => unknown;
  /** Local-only move-strip/Explore navigation (design.md §5.5) — never sent
   * to the server; the next coach show_position snaps back to answer mode. */
  peekAt: (ply: number) => void;
  /** design.md §5.4: the peek-mode pill's "⟲ back to coach" action — restores
   * answer mode at the last position the coach actually set, not wherever
   * peek/Explore navigation happened to leave the board. */
  backToCoach: () => void;
  /** Clicking a chat PositionDivider while peeking and then sending a message
   * promotes the peeked position to the new coach position in place — unlike
   * backToCoach, this does not move the board back to the old coachPly. */
  anchorHere: () => void;
  /** architecture §14 (play mode): the board-facing consequences of a move
   * just committed server-side — the student's own move (POST /play-move)
   * or the coach's (the play_coach_move tool's result). Similar to
   * show_position's branch of handleToolCall, but reveals immediately
   * (revealResult: true) rather than anchoring pre-move — that anchor
   * exists to let the student guess before seeing a move under REVIEW
   * (analyze mode); a move just actually played live has nothing to guess,
   * hiding it behind a reveal click would just be confusing. The caller is
   * expected to also append `{ply: newPly, fen, moveUci}` to the `positions`
   * array it passes this hook, but doesn't have to land in the very same
   * render — fen/moveUci are kept as a local fallback for the new ply until
   * `positions` catches up, so the board is always correct on read. */
  applyServerMove: (newPly: number, fen: string, moveUci?: string | null) => void;
}

/** UCI encodes a move as `<from><to>[promotion]` (chess-analysis's parsePgn),
 * so the last move's squares are derived from position data directly — no
 * coach tool call required. Exported for the read-only Game Review page
 * (useGameReviewPageData), which wants the same highlight without the rest
 * of this hook's session/chat machinery. */
export function lastMoveHighlightsFor(moveUci: string | null | undefined): BoardHighlight[] {
  if (!moveUci) return [];
  const from = moveUci.slice(0, 2);
  const to = moveUci.slice(2, 4);
  return [
    { square: from, color: 'var(--last-move)' },
    { square: to, color: 'var(--last-move)' }
  ];
}

/** Same from/to slicing as lastMoveHighlightsFor, drawn as a red arrow
 * instead of square highlights — shown while anchored one position before
 * the move being discussed, i.e. whenever show_position was called with
 * preMove: true (see useSessionBoardState's isAnchoredPreMove). */
function playedMoveArrowFor(moveUci: string | null | undefined): BoardArrow[] {
  if (!moveUci) return [];
  return [{ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), color: 'var(--played-move)' }];
}

/**
 * Owns the board-facing consequences of the coach's tool calls (architecture
 * §7.1): show_position moves the board, clearing any prior annotations
 * (design.md §5.4); annotate_board sets arrows/highlights. Both are client tools, so their
 * return value here becomes the tool result useCoachChat posts back.
 */
export function useSessionBoardState(
  positions: SessionPosition[],
  initialPly?: number,
  /** play_bot games have no "pre-move quiz" concept (that's a coach
   * show_position device, see isAnchoredPreMove's doc comment) — a resumed
   * bot game must always open on the real position, never anchored one ply
   * behind a hidden "reveal" pill. Defaults false so analyze/play mode's
   * existing seeding (revealed only at ply 0) is unchanged. */
  alwaysReveal = false
): UseSessionBoardStateResult {
  const [ply, setPly] = useState(0);
  const [mode, setMode] = useState<BoardMode>('answer');
  const [coachPly, setCoachPly] = useState(0);
  const [previewFen, setPreviewFen] = useState<string | null>(null);
  // Fallback for applyServerMove's new ply until the caller's `positions`
  // array — owned outside this hook — actually contains it (same render or
  // a later one; both must work, see applyServerMove's doc comment).
  const [pendingServerPosition, setPendingServerPosition] = useState<SessionPosition | null>(null);
  // show_position's own preMove: true anchors the board one ply BEFORE the
  // move being discussed (with a red arrow, see isAnchoredPreMove) —
  // revealResult false means "still anchored".
  const [revealResult, setRevealResult] = useState(true);
  // revealResult at coachPly, i.e. whatever show_position/applyServerMove
  // actually left the coach's own position in — backToCoach restores this
  // (not a blanket re-anchor) so a preMove: false position doesn't come
  // back anchored just because peeking moved `revealResult` away from it.
  const [coachRevealResult, setCoachRevealResult] = useState(true);
  const annotations = useAnnotationLayer();

  // initialPly arrives after the session fetch resolves (a later render, not
  // mount), so it must be seeded via effect rather than useState's initial
  // value — mirrors useCoachChat's initialMessages seeding for the same
  // reason (SessionPage.tsx).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && initialPly !== undefined) {
      seededRef.current = true;
      setPly(initialPly);
      setCoachPly(initialPly);
      setRevealResult(alwaysReveal || initialPly === 0);
      setCoachRevealResult(alwaysReveal || initialPly === 0);
    }
  }, [initialPly, alwaysReveal]);

  const currentPosition =
    positions.find((position) => position.ply === ply) ??
    (pendingServerPosition?.ply === ply ? pendingServerPosition : undefined) ??
    positions[0];
  const isAnchoredPreMove = mode === 'answer' && !revealResult && ply > 0 && Boolean(currentPosition?.moveUci);
  const displayPosition = isAnchoredPreMove
    ? (positions.find((position) => position.ply === ply - 1) ?? currentPosition)
    : currentPosition;
  const fen = previewFen ?? displayPosition?.fen ?? '';
  const lastMoveHighlights = isAnchoredPreMove ? [] : lastMoveHighlightsFor(currentPosition?.moveUci);
  const playedMoveArrows = isAnchoredPreMove ? playedMoveArrowFor(currentPosition?.moveUci) : [];

  const previewMove = useCallback((newFen: string) => {
    setPreviewFen(newFen);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewFen(null);
  }, []);

  const handleToolCall = useCallback(
    (toolCall: CoachToolCall): unknown => {
      if (toolCall.toolName === 'show_position') {
        const { moveNumber, color, intent, preMove } = toolCall.input as {
          moveNumber: number;
          color: 'white' | 'black' | null;
          intent: 'flashback' | 'subject';
          preMove: boolean;
        };
        const newPly = moveRefToPly(moveNumber, color);
        setPly(newPly);
        setCoachPly(newPly);
        setMode('answer');
        setPreviewFen(null);
        // preMove: true anchors the board one ply before newPly (with a red
        // arrow, see isAnchoredPreMove) — meaningless at ply 0 (nothing to
        // anchor before), so always revealed there regardless of the flag.
        const revealed = newPly === 0 ? true : !preMove;
        setRevealResult(revealed);
        setCoachRevealResult(revealed);
        annotations.clear();
        // intent round-trips to the server as-is (apps/api's
        // applyClientToolResult reads it to decide whether to move the
        // conversation's subject, not just the board) — the board itself
        // behaves identically either way.
        return { moveNumber, color, ply: newPly, intent, preMove };
      }
      if (toolCall.toolName === 'annotate_board') {
        annotations.setAnnotations(toolCall.input as AnnotationState);
        return { acknowledged: true };
      }
      return undefined;
    },
    [annotations]
  );

  const peekAt = useCallback((newPly: number) => {
    setPly(newPly);
    setMode('peek');
    setPreviewFen(null);
  }, []);

  const backToCoach = useCallback(() => {
    setPly(coachPly);
    setMode('answer');
    setPreviewFen(null);
    // Restore whatever reveal state the coach's own position was actually
    // left in (preMove: true or false) — not a blanket re-anchor, which
    // would wrongly re-anchor a position show_position had fully revealed.
    setRevealResult(coachRevealResult);
  }, [coachPly, coachRevealResult]);

  const anchorHere = useCallback(() => {
    setCoachPly(ply);
    setMode('answer');
    // The student navigated here directly (peek/move-list/drag) and already
    // saw this exact position — promoting it shouldn't suddenly swap the
    // board to one move earlier behind their back.
    setRevealResult(true);
    setCoachRevealResult(true);
  }, [ply]);

  const revealPlayedMove = useCallback(() => {
    setRevealResult(true);
    setCoachRevealResult(true);
  }, []);

  const applyServerMove = useCallback(
    (newPly: number, fen: string, moveUci?: string | null) => {
      setPendingServerPosition({ ply: newPly, fen, moveUci: moveUci ?? null });
      setPly(newPly);
      setCoachPly(newPly);
      setMode('answer');
      setPreviewFen(null);
      // Always reveal immediately — unlike show_position's pre-move anchor
      // (a deliberate "guess before you see it" quiz device for reviewing a
      // past move), a move just actually played live has nothing to guess.
      setRevealResult(true);
      setCoachRevealResult(true);
      annotations.clear();
    },
    [annotations]
  );

  return {
    fen,
    ply,
    coachPly,
    mode,
    setMode,
    arrows: [...playedMoveArrows, ...annotations.arrows],
    highlights: [...lastMoveHighlights, ...annotations.highlights],
    setAnnotations: annotations.setAnnotations,
    isAnchoredPreMove,
    revealPlayedMove,
    previewMove,
    clearPreview,
    handleToolCall,
    peekAt,
    backToCoach,
    anchorHere,
    applyServerMove
  };
}
