import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { applySanSequence } from '@freechesscoach/chess-analysis';
import { ChevronLeftIcon, UndoIcon } from '../../components/Icon.js';
import type { HoverMove } from '../chat/MessageList.js';
import { BoardActionBar } from '../board/BoardActionBar.js';
import { CoachBoard, type BoardArrow, type BoardHighlight, type LocalMoveInfo } from '../board/CoachBoard.js';
import { DivergedLinePanel } from '../board/DivergedLinePanel.js';
import { EvalBar } from '../board/EvalBar.js';
import { ExploreNoteCard } from '../board/ExploreNoteCard.js';
import { GameEvalChart } from '../board/GameEvalChart.js';
import { MoveNavStrip } from '../board/MoveNavStrip.js';
import type { UseExploreFeedbackResult } from '../board/useExploreFeedback.js';
import { useHintMoves } from '../board/useHintMoves.js';
import type { ArrowRef } from '../chat/arrowToken.js';
import { encodeDivergedLine } from '../chat/divergedLine.js';
import type { BotGameOverInfo } from './botGameOver.js';
import type { CommittedMoveRef } from './usePlayMoveSubmit.js';
import { usePlayMoveSubmit } from './usePlayMoveSubmit.js';
import { usePlayBotMoveSubmit } from './usePlayBotMoveSubmit.js';
import type { useDivergedLine } from './useDivergedLine.js';
import type { useSessionBoardState } from './useSessionBoardState.js';
import { useShowLegalMoveDots } from '../../hooks/useShowLegalMoveDots.js';

const UNDO_PILL_MS = 2000;

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
  onPlayMoveCommitted?: (result: CommittedMoveRef, uci: string) => void;
  /** play_bot only: fires once when a play-move response reports the game
   * ended, with who won/drew and why, so the caller can refetch session
   * status and show the result (GameOverDialog/BotStatusPanel). */
  onGameOver?: (gameOver: BotGameOverInfo) => void;
  /** play/play_bot only: the BoardActionBar Undo button's handler
   * (useSessionPageData/useBotSessionPageData's undoLastMove) — undoes the
   * student's last move and the opponent's (coach's or bot's) reply to it
   * together, see bot-undo.ts. Omitted by analyze mode, which has no live
   * move to undo. */
  onUndoMove?: () => void;
  undoDisabled?: boolean;
  /** play_bot only: fires once per move exchange with the post-move
   * remaining time for each side (see usePlayBotMoveSubmit's own doc
   * comment) — null/null for an untimed game. */
  onClockUpdate?: (whiteRemainingMs: number | null, blackRemainingMs: number | null) => void;
  /** play_bot only: fires whenever usePlayBotMoveSubmit's own isSubmitting
   * flips, so a caller that renders BotStatusPanel above this column (a
   * sibling, not a child) can show "{bot} is thinking…" for the live
   * duration of the round trip — see BotStatusPanel's isBotThinking prop. */
  onBotThinkingChange?: (isThinking: boolean) => void;
  /** BotSessionPage's "hide status bar" option also hides every indicator of
   * who's better — the eval bar next to the board and the eval-over-time
   * graph below it — not just the opponent card, since seeing "how good each
   * side is" during a live game is the same kind of engine-assist "Explore
   * on your own" was removed for. Defaults true so analyze/play mode, which
   * never pass this prop, are unaffected. */
  showEvalIndicators?: boolean;
  /** play_bot only: true once the game itself has ended (any reason) — ORed
   * into the board's own in-flight-submission disabled state, since a
   * resignation/timeout ending (unlike checkmate/stalemate) leaves ordinary
   * legal moves still available on the board with nothing else stopping
   * them. Defaults false so analyze/play mode, which never pass this prop,
   * are unaffected. */
  boardDisabled?: boolean;
  /** "Explore on your own" — owned by the caller (SessionPage/
   * BotSessionPage), not this column, since SessionPage's mobile layout
   * also needs it (the "coach box" swap in MobileCoachSessionBody).
   * Available in every sessionMode (analyze, play, play_bot). */
  isExploring?: boolean;
  onOpenExplore?: () => void;
  onCloseExplore?: () => void;
  exploreFeedback?: UseExploreFeedbackResult;
  /** play_bot only: a rated game — no hint, undo or Explore (the caller also
   * withholds move feedback and eval). Defaults false. */
  restricted?: boolean;
}

const IDLE_EXPLORE_FEEDBACK: UseExploreFeedbackResult = {
  status: 'idle',
  evaluation: null,
  evalCp: null,
  arrows: [],
  highlights: [],
  note: undefined
};

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
  onBotThinkingChange,
  showEvalIndicators = true,
  boardDisabled = false,
  isExploring = false,
  onOpenExplore,
  onCloseExplore,
  exploreFeedback = IDLE_EXPLORE_FEEDBACK,
  restricted = false
}: SessionBoardColumnProps): ReactNode {
  const [showLegalMoveDots] = useShowLegalMoveDots();
  const [pendingMove, setPendingMove] = useState<{ san: string; fen: string } | null>(null);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playMove = usePlayMoveSubmit(sessionId, sendMessage, onPlayMoveCommitted);
  // Cheap when idle (no fetch until .submit() is called) — calling both
  // unconditionally, rather than conditionally on sessionMode, keeps this a
  // valid, unconditional hook call regardless of which mode is active.
  const playBotMove = usePlayBotMoveSubmit(sessionId, onPlayMoveCommitted, onGameOver, onClockUpdate);
  useEffect(() => {
    onBotThinkingChange?.(playBotMove.isSubmitting);
  }, [playBotMove.isSubmitting, onBotThinkingChange]);

  const fen = divergedLine.fen ?? boardState.fen;
  // Shared by every sessionMode that offers a Hint button (play/play_bot,
  // not analyze — see BoardActionBar's own hint prop doc comment). Declared
  // unconditionally, like playMove/playBotMove above, so hook order stays
  // stable regardless of which mode is active.
  const hintMoves = useHintMoves(fen);

  /** design.md-adjacent: expect_move (the coach's "I want exactly one move
   * as the answer" signal) preserves today's instant 2s-undo-then-send
   * path — every other answer-mode drop instead silently appends to the
   * diverged line (no send, no pill) until the student hits Send. */
  function handleUserMove(san: string, moveFen: string, uci: string): void {
    if (sessionMode === 'play') {
      // Captured now, before the move commits and the position (hence
      // hintMoves' own fen-keyed reset effect) moves on — see the "used
      // hint" message annotation this feeds, mirrored on
      // [move_attempt]/[diverged_line]'s own line-explored note.
      void playMove.submit(san, uci, hintMoves.stage > 0);
      return;
    }
    if (sessionMode === 'play_bot') {
      void playBotMove.submit(san, uci);
      return;
    }
    if (divergedLine.expectingMove) {
      setPendingMove({ san, fen: moveFen });
      pendingTimeoutRef.current = setTimeout(() => {
        divergedLine.consumeExpectingMove();
        const message = divergedLine.line
          ? encodeDivergedLine(divergedLine.appendMove({ san, fen: moveFen, uci }, currentRealPosition), '')
          : `[board_move] I played ${san} (position now: ${moveFen})`;
        sendMessage(message);
        setPendingMove(null);
      }, UNDO_PILL_MS);
      return;
    }
    divergedLine.appendMove({ san, fen: moveFen, uci }, currentRealPosition);
  }

  function handleUndoMove(): void {
    if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
    setPendingMove(null);
    boardState.clearPreview();
  }

  /** CoachBoard only fires onUserMove in 'answer' mode (design.md §5.4) — a
   * move played while peeked/exploring only ever reaches onLocalMove, a
   * fen-only preview that overwrites itself on the next move with no
   * sequence kept. But coach-method.ts already tells the coach "the student
   * can build [a hypothetical] themselves by moving pieces on the board —
   * those moves reach you together with their comment", so a peek-mode move
   * (any sessionMode — Explore on your own now works everywhere, not just
   * analyze) must still accumulate into divergedLine exactly like an
   * answer-mode one does, or the whole line explored is lost by the time
   * Send is pressed and only a single-move [position_context] naming the
   * real game's own move survives. Harmless in play_bot, which has no chat
   * to send it to — it's just the sandbox's own scratch line there, stepped
   * through via the same undo-last-move pill every other mode gets.
   * applySanSequence recomputes the uci here since onLocalMove's
   * LocalMoveInfo carries none (CoachBoard's onUserMove is the only caller
   * that already has it, from the chess.js move object itself). */
  function handleLocalMove(moveFen: string, move: LocalMoveInfo): void {
    boardState.previewMove(moveFen, move);
    if (boardState.mode !== 'peek') return;
    const applied = applySanSequence(move.fenBefore, [move.san]).moves[0];
    if (!applied) return;
    divergedLine.appendMove({ san: move.san, fen: moveFen, uci: applied.uci }, currentRealPosition);
  }

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

  // Hint only makes sense where there's a live move to hint at — analyze
  // mode is reviewing an already-played game, nothing to suggest.
  const showHint = sessionMode !== 'analyze' && !restricted;

  // While exploring, the eval bar and the on-board move-quality icon track
  // the sandbox's own engine-pipeline feedback instead of the recorded
  // game's classifiedMoves — same live behavior Game Review's board has for
  // a real position (GameReviewBoardColumn), just sourced from
  // useExploreFeedback instead of a persisted classification.
  const exploreMoveQualityBadge =
    isExploring && exploreFeedback.note?.uci
      ? { square: exploreFeedback.note.uci.slice(2, 4), quality: exploreFeedback.note.quality }
      : undefined;

  const evalBar = showEvalIndicators && (
    <EvalBar
      ply={boardState.ply}
      classifiedMoves={classifiedMoves ?? []}
      orientation={orientation}
      cpOverride={isExploring ? (exploreFeedback.evalCp ?? undefined) : undefined}
    />
  );

  return (
    <div className="session-board-column">
      <div className="session-board-row">
        {evalBar}
        <CoachBoard
          fen={fen}
          orientation={orientation}
          mode={boardState.mode}
          isExploring={isExploring}
          arrows={[...boardState.arrows, ...hoverMoveArrowsFor(hoverMove), ...(showHint ? hintMoves.arrows : []), ...exploreFeedback.arrows]}
          highlights={[
            ...boardState.highlights,
            ...hoverMoveHighlightsFor(hoverMove),
            ...(showHint ? hintMoves.highlights : []),
            ...exploreFeedback.highlights
          ]}
          onUserMove={handleUserMove}
          onLocalMove={handleLocalMove}
          onArrowsChange={onArrowsChange}
          showLegalMoveDots={showLegalMoveDots}
          disabled={playMove.isSubmitting || playBotMove.isSubmitting || boardDisabled}
          moveQualityBadge={exploreMoveQualityBadge}
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
          {/* isExploring, not just sessionMode, decides the wording now that
              Explore also opens play_bot into peek mode — "reviewing" is
              only accurate for plain history browsing there, not the
              engine-assisted sandbox (which already has its own pill via
              BoardActionBar/ExplorePanel below; this one is the generic
              "you're looking at another position" pill every peek gets). */}
          {isExploring || sessionMode !== 'play_bot' ? 'exploring' : 'reviewing'} —{' '}
          <button type="button" onClick={boardState.backToCoach}>
            <ChevronLeftIcon width={13} height={13} />
            {sessionMode === 'play_bot' ? 'back to game' : 'back to coach'}
          </button>
        </p>
      )}
      {/* Mobile's own combined row (chevrons + the scrollable move-chip
          list, one line — MoveNavStrip, shared with Game Review's mobile
          layout) replaces play_bot's own Previous/Next below to avoid two
          redundant pairs of step buttons stacked on a phone; desktop keeps
          the toolbar's own pair since MoveNavStrip never renders there
          (the sidebar's MoveExplorer has its own separate nav pills). */}
      {!isDesktop && (
        <MoveNavStrip
          sanMoves={sanMoves}
          classifiedMoves={classifiedMoves ?? []}
          positions={positions}
          ply={boardState.ply}
          onSelect={peekAt}
          onStepBack={handleStepBack}
          onStepForward={handleStepForward}
        />
      )}
      {/* One shared bar (Explore toggle, Undo, Hint) for every live-position
          board — see BoardActionBar's own doc comment for why the old
          per-mode toolbars (bot-move-toolbar's `< >` included — that step
          navigation already lives in MoveExplorer/MoveNavStrip above) were
          replaced with this single component. Mobile without an active
          diverged line, or desktop unconditionally (its own DivergedLinePanel
          lives in the sidebar, owned by the page, not this column). */}
      {(isDesktop || !divergedLine.line) && !restricted && (
        <BoardActionBar
          isExploring={isExploring}
          onOpenExplore={() => onOpenExplore?.()}
          onCloseExplore={() => onCloseExplore?.()}
          exploreStatus={exploreFeedback.status}
          exploreEvaluation={exploreFeedback.evaluation}
          onUndo={onUndoMove}
          undoDisabled={undoDisabled}
          hint={showHint ? hintMoves : undefined}
        />
      )}
      {!isDesktop && divergedLine.line && (
        <DivergedLinePanel
          line={divergedLine.line}
          stepIndex={divergedLine.stepIndex}
          onSelectStep={divergedLine.previewStep}
          onExit={divergedLine.exit}
          autoplayIntervalMs={autoplayIntervalMs}
          onChangeAutoplayInterval={onChangeAutoplayInterval}
        />
      )}
      {/* Mobile gets the same note through MobileCoachSessionBody's own
          "coach box" swap instead (SessionPage) — rendering it here too
          would just be the same card twice, stacked below the board. */}
      {isDesktop && isExploring && (
        <ExploreNoteCard status={exploreFeedback.status} evaluation={exploreFeedback.evaluation} note={exploreFeedback.note} />
      )}
      {isDesktop && showEvalIndicators && classifiedMoves && classifiedMoves.length > 0 && (
        <GameEvalChart classifiedMoves={classifiedMoves} currentPly={boardState.ply} onSelect={peekAt} />
      )}
    </div>
  );
}
