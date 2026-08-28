import { useEffect, useRef, useState, type ReactNode } from 'react';
import { computePositionFeatures } from '@freechesscoach/chess-analysis';
import { HintMovesResponseSchema, type ClassifiedMoveDto } from '@freechesscoach/shared';
import { apiPost } from '../../api/client.js';
import { ChevronLeftIcon, ChevronRightIcon, LightbulbIcon, UndoIcon } from '../../components/Icon.js';
import type { HoverMove } from '../chat/MessageList.js';
import { CoachBoard, type BoardArrow, type BoardHighlight } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { EvalBar } from '../board/EvalBar.js';
import { ExplorePanel } from '../board/ExplorePanel.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import { MoveStrip } from '../board/MoveStrip.js';
import type { ArrowRef } from '../chat/arrowToken.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import { describePly, sanForPly } from '../chat/positionDivider.js';
import type { CommittedPlayMove } from './usePlayMoveSubmit.js';
import { usePlayMoveSubmit } from './usePlayMoveSubmit.js';
import { usePlayBotMoveSubmit } from './usePlayBotMoveSubmit.js';
import type { useDivergedLine } from './useDivergedLine.js';
import type { useSessionBoardState } from './useSessionBoardState.js';
import type { useWasmEngine } from '../../hooks/useWasmEngine.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';

const UNDO_PILL_MS = 2000;

// Deliberately not the same tokens legal-move dots/selection use, so a hint
// never gets confused with those — the hue itself carries the meaning
// (red = defend, green = attackable) at low opacity so the piece underneath
// stays legible.
const HINT_DEFEND_HIGHLIGHT = 'rgba(192, 57, 43, 0.35)';
const HINT_ATTACK_HIGHLIGHT = 'rgba(91, 156, 106, 0.35)';
const HINT_MOVE_ARROW_COLORS = ['var(--annotate-1)', 'var(--annotate-2)', 'var(--annotate-hover)'];

interface HintTopMove {
  san: string;
  from: string;
  to: string;
}

export interface SessionBoardColumnProps {
  boardState: ReturnType<typeof useSessionBoardState>;
  divergedLine: ReturnType<typeof useDivergedLine>;
  currentRealPosition: { ply: number; fen: string };
  orientation: 'white' | 'black';
  sanMoves: string[];
  /** ply-indexed positions (ply 0 = game start) — threaded through to
   * MoveStrip for the move analysis inspector's fen lookup. */
  positions: { ply: number; fen: string }[];
  classifiedMoves: ClassifiedMoveDto[] | null | undefined;
  isDesktop: boolean;
  engine: ReturnType<typeof useWasmEngine>;
  autoplayIntervalMs: number;
  onChangeAutoplayInterval: (ms: number) => void;
  sendMessage: (content: string) => void;
  onArrowsChange: (arrows: ArrowRef[]) => void;
  /** The move currently hovered/focused in the chat transcript (design.md
   * §5.3) — drawn on top of the coach's own annotate_board arrows/highlights
   * in a distinct color, cleared on mouse-leave/blur. */
  hoverMove?: HoverMove;
  /** architecture §14 / "Play vs Bot" plan: 'play' and 'play_bot' both route
   * a board drop through POST /api/sessions/:id/play-move instead of analyze
   * mode's instant [board_move] chat message — 'play_bot' additionally
   * receives the bot's synchronous reply in that same response. */
  sessionMode: 'analyze' | 'play' | 'play_bot';
  sessionId: string;
  /** Applies a just-committed move's board-side consequences (append to
   * positions, move the board) — owned by the caller (useSessionPageData /
   * useBotSessionPageData), since positions/boardState live above this
   * component. Required in play/play_bot mode; in play_bot mode this fires
   * once for the student's move and again for the bot's. */
  onPlayMoveCommitted?: (result: CommittedPlayMove, uci: string) => void;
  /** play_bot only: fires once when a play-move response reports the game
   * ended, so the caller can refetch session status. */
  onGameOver?: () => void;
  /** play_bot only: the "Undo" button's handler (useBotSessionPageData's
   * undoLastMove) — undoes the student's last move and the bot's reply to
   * it together, see bot-undo.ts. */
  onUndoMove?: () => void;
  undoDisabled?: boolean;
  /** play_bot only: fires once per move exchange with the post-move
   * remaining time for each side (see usePlayBotMoveSubmit's own doc
   * comment) — null/null for an untimed game. */
  onClockUpdate?: (whiteRemainingMs: number | null, blackRemainingMs: number | null) => void;
  /** BotSessionPage's "hide status bar" option also hides every indicator of
   * who's better — the eval bar next to the board and the eval-over-time
   * graph below it — not just the opponent card, since seeing "how good each
   * side is" during a live game is the same kind of engine-assist "Explore
   * on your own" was removed for. Defaults true so analyze/play mode, which
   * never pass this prop, are unaffected. */
  showEvalIndicators?: boolean;
}

/** Distinct from the coach's own annotate_board arrows (--annotate-1) and
 * the last-played-move highlight — a third color reserved for previewing a
 * move mentioned in chat text, design.md §5.3. */
function hoverMoveArrowsFor(hoverMove: HoverMove | undefined): BoardArrow[] {
  if (!hoverMove) return [];
  return [{ from: hoverMove.from, to: hoverMove.to, color: 'var(--annotate-hover)' }];
}

function hoverMoveHighlightsFor(hoverMove: HoverMove | undefined): BoardHighlight[] {
  if (!hoverMove) return [];
  return [
    { square: hoverMove.from, color: 'var(--annotate-hover)' },
    { square: hoverMove.to, color: 'var(--annotate-hover)' }
  ];
}

/** The board + its overlay pills + the explore/analysis panels below it —
 * self-contained pending-move state (the 2s undo window) lives here since
 * nothing outside this column reads it. */
export function SessionBoardColumn({
  boardState,
  divergedLine,
  currentRealPosition,
  orientation,
  sanMoves,
  positions,
  classifiedMoves,
  isDesktop,
  engine,
  autoplayIntervalMs,
  onChangeAutoplayInterval,
  sendMessage,
  onArrowsChange,
  hoverMove,
  sessionMode,
  sessionId,
  onPlayMoveCommitted,
  onGameOver,
  onUndoMove,
  undoDisabled,
  onClockUpdate,
  showEvalIndicators = true
}: SessionBoardColumnProps): ReactNode {
  const [showLegalMoveDots] = useShowLegalMoveDots();
  const [pendingMove, setPendingMove] = useState<{ san: string; fen: string } | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playMove = usePlayMoveSubmit(sessionId, sendMessage, onPlayMoveCommitted);
  // Cheap when idle (no fetch until .submit() is called) — calling both
  // unconditionally, rather than conditionally on sessionMode, keeps this a
  // valid, unconditional hook call regardless of which mode is active.
  const playBotMove = usePlayBotMoveSubmit(sessionId, onPlayMoveCommitted, onGameOver, onClockUpdate);

  /** design.md-adjacent: expect_move (the coach's "I want exactly one move
   * as the answer" signal) preserves today's instant 2s-undo-then-send
   * path — every other answer-mode drop instead silently appends to the
   * diverged line (no send, no pill) until the student hits Send. */
  function handleUserMove(san: string, fen: string, uci: string): void {
    if (sessionMode === 'play') {
      void playMove.submit(san, uci);
      return;
    }
    if (sessionMode === 'play_bot') {
      void playBotMove.submit(san, uci);
      return;
    }
    if (divergedLine.expectingMove) {
      setPendingMove({ san, fen });
      pendingTimeoutRef.current = setTimeout(() => {
        divergedLine.consumeExpectingMove();
        const message = divergedLine.line
          ? encodeDivergedLine(divergedLine.appendMove({ san, fen, uci }, currentRealPosition), '')
          : `[board_move] I played ${san} (position now: ${fen})`;
        sendMessage(message);
        setPendingMove(null);
      }, UNDO_PILL_MS);
      return;
    }
    divergedLine.appendMove({ san, fen, uci }, currentRealPosition);
  }

  function handleUndoMove(): void {
    if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    setPendingMove(null);
    boardState.clearPreview();
  }

  const fen = divergedLine.fen ?? boardState.fen;

  function peekAt(ply: number): void {
    divergedLine.exit();
    boardState.peekAt(ply);
  }

  // play_bot's back/forward move navigation — stepping to the last ply
  // returns to the live position (backToCoach) rather than peekAt, so the
  // "exploring" pill and its border tint don't linger once you're caught
  // back up to the actual game.
  const maxPly = sanMoves.length;
  function handleStepBack(): void {
    if (boardState.ply > 0) peekAt(boardState.ply - 1);
  }
  function handleStepForward(): void {
    const next = boardState.ply + 1;
    if (next >= maxPly) {
      divergedLine.exit();
      boardState.backToCoach();
    } else {
      peekAt(next);
    }
  }

  // The bot page's two-stage hint: first click marks the tactically
  // relevant squares of the CURRENT position (facts, not advice — computed
  // client-side, no engine call needed); a second click escalates to the
  // engine's actual top 3 moves. A third click, or the position changing
  // (a move was made), collapses/resets it.
  const [hintStage, setHintStage] = useState<0 | 1 | 2>(0);
  const [hintTopMoves, setHintTopMoves] = useState<HintTopMove[]>([]);
  const [isLoadingHintMoves, setIsLoadingHintMoves] = useState(false);
  const [hintError, setHintError] = useState(false);
  // Guards against a slow/late engine response landing after the student has
  // already moved on (a new position, or clicked Hint again) — the request
  // that's still current is the only one allowed to update state.
  const hintRequestRef = useRef(0);

  useEffect(() => {
    setHintStage(0);
    setHintTopMoves([]);
    setHintError(false);
    hintRequestRef.current += 1;
  }, [fen]);

  function handleHintClick(): void {
    if (hintStage === 0) {
      setHintStage(1);
      setHintError(false);
      return;
    }
    if (hintStage === 1) {
      setHintStage(2);
      setHintError(false);
      setIsLoadingHintMoves(true);
      const requestId = ++hintRequestRef.current;
      void apiPost('/api/positions/hint-moves', { fen }, HintMovesResponseSchema)
        .then(({ lines }) => {
          if (hintRequestRef.current !== requestId) return;
          setHintTopMoves(
            lines.map((line) => ({ san: line.moveSan, from: line.moveUci.slice(0, 2), to: line.moveUci.slice(2, 4) }))
          );
          setIsLoadingHintMoves(false);
        })
        // A server-side search failure (engine unreachable, etc.) — without
        // this the "Thinking…" bubble was stuck forever on an unhandled
        // rejection (the in-browser WASM engine this used to call had no
        // error handling either, and could hang or fail outright depending
        // on the user's own browser/environment — this endpoint sidesteps
        // that entirely by running server-side, the same reliable engine
        // path the bot's own moves already use).
        .catch(() => {
          if (hintRequestRef.current !== requestId) return;
          setIsLoadingHintMoves(false);
          setHintError(true);
        });
      return;
    }
    setHintStage(0);
  }

  const hintFeatures = hintStage === 1 ? computePositionFeatures(fen) : null;
  const hintHighlights: BoardHighlight[] = hintFeatures
    ? [
        ...hintFeatures.piecesUnderAttack
          .filter((piece) => piece.color === orientation)
          .map((piece) => ({ square: piece.square, color: HINT_DEFEND_HIGHLIGHT })),
        ...hintFeatures.piecesUnderAttack
          .filter((piece) => piece.color !== orientation)
          .map((piece) => ({ square: piece.square, color: HINT_ATTACK_HIGHLIGHT }))
      ]
    : [];
  const hintArrows: BoardArrow[] =
    hintStage === 2
      ? hintTopMoves.map((move, index) => ({
          from: move.from,
          to: move.to,
          color: HINT_MOVE_ARROW_COLORS[index % HINT_MOVE_ARROW_COLORS.length] ?? 'var(--annotate-1)'
        }))
      : [];

  return (
    <div className="session-board-column">
      <div className="session-board-row">
        {showEvalIndicators && <EvalBar ply={boardState.ply} classifiedMoves={classifiedMoves ?? []} orientation={orientation} />}
        <CoachBoard
          fen={fen}
          orientation={orientation}
          mode={boardState.mode}
          arrows={[...boardState.arrows, ...hoverMoveArrowsFor(hoverMove), ...hintArrows]}
          highlights={[...boardState.highlights, ...hoverMoveHighlightsFor(hoverMove), ...hintHighlights]}
          onUserMove={handleUserMove}
          onLocalMove={boardState.previewMove}
          onArrowsChange={onArrowsChange}
          showLegalMoveDots={showLegalMoveDots}
        />
      </div>
      {(playMove.error || playBotMove.error) && (
        <p className="play-move-error" role="alert">
          {playMove.error || playBotMove.error}
        </p>
      )}
      {pendingMove && (
        <p className="undo-pill">
          Sending {pendingMove.san}…{' '}
          <button type="button" onClick={handleUndoMove}>
            <UndoIcon width={13} height={13} />
            undo
          </button>
        </p>
      )}
      {!pendingMove && divergedLine.line && (
        <p className="undo-pill">
          <button type="button" onClick={divergedLine.undoLastMove}>
            <UndoIcon width={13} height={13} />
            undo last move
          </button>
        </p>
      )}
      {boardState.mode === 'peek' && (
        <p className="peek-pill">
          {sessionMode === 'play_bot' ? 'reviewing' : 'exploring'} —{' '}
          <button type="button" onClick={boardState.backToCoach}>
            <ChevronLeftIcon width={13} height={13} />
            {sessionMode === 'play_bot' ? 'back to game' : 'back to coach'}
          </button>
        </p>
      )}
      {sessionMode === 'play_bot' && (
        <div className="bot-move-toolbar">
          <button type="button" onClick={handleStepBack} disabled={boardState.ply <= 0} aria-label="Previous move">
            <ChevronLeftIcon width={16} height={16} />
          </button>
          <button type="button" onClick={handleStepForward} disabled={boardState.ply >= maxPly} aria-label="Next move">
            <ChevronRightIcon width={16} height={16} />
          </button>
          {onUndoMove && (
            <button type="button" className="bot-move-toolbar__undo" onClick={onUndoMove} disabled={undoDisabled}>
              <UndoIcon width={14} height={14} />
              Undo
            </button>
          )}
          <button type="button" className="bot-move-toolbar__hint" onClick={handleHintClick} aria-pressed={hintStage > 0}>
            <LightbulbIcon width={14} height={14} />
            Hint
          </button>
        </div>
      )}
      {sessionMode === 'play_bot' && hintStage > 0 && (
        <p className="hint-bubble" role="status">
          {hintStage === 1
            ? 'Red squares need defending — green squares are pieces you can attack.'
            : hintError
              ? "Couldn't get a suggestion — try again."
              : isLoadingHintMoves
                ? 'Thinking…'
                : hintTopMoves.length > 0
                  ? `Top moves: ${hintTopMoves.map((move) => move.san).join(', ')}`
                  : 'No moves to suggest.'}
        </p>
      )}
      {boardState.isAnchoredPreMove && (
        <p className="played-move-pill">
          {describePly(boardState.ply).color} played {sanForPly(sanMoves, boardState.ply)}{' '}
          <button type="button" onClick={boardState.revealPlayedMove}>
            reveal
            <ChevronRightIcon width={13} height={13} />
          </button>
        </p>
      )}
      {!isDesktop && (
        <MoveStrip
          sanMoves={sanMoves}
          classifiedMoves={classifiedMoves ?? []}
          positions={positions}
          currentPly={boardState.ply}
          momentPlies={[]}
          onSelect={peekAt}
        />
      )}
      {sessionMode === 'analyze' &&
        (!isDesktop && divergedLine.line ? (
          <DivergedLinePanel
            line={divergedLine.line}
            stepIndex={divergedLine.stepIndex}
            onSelectStep={divergedLine.previewStep}
            onExit={divergedLine.exit}
            autoplayIntervalMs={autoplayIntervalMs}
            onChangeAutoplayInterval={onChangeAutoplayInterval}
          />
        ) : (
          // "Explore on your own" is an engine-assisted analysis mode — it
          // doesn't belong in a game you're actively playing (play/play_bot),
          // only in reviewing a finished/imported one.
          <ExplorePanel fen={fen} mode={boardState.mode} onEnterPeekMode={() => boardState.setMode('peek')} engine={engine} />
        ))}
      {isDesktop && showEvalIndicators && classifiedMoves && classifiedMoves.length > 0 && (
        <GameEvalChart classifiedMoves={classifiedMoves} currentPly={boardState.ply} onSelect={peekAt} />
      )}
    </div>
  );
}
