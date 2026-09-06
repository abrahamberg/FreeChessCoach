import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Chessboard,
  type Arrow,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
  type PieceHandlerArgs,
  type SquareHandlerArgs
} from 'react-chessboard';
import { PromotionPicker, type PromotionPiece } from './PromotionPicker.js';
import './CoachBoard.css';

const SELECTED_SQUARE_STYLE: CSSProperties = { backgroundColor: 'rgba(0, 140, 60, 0.65)' };
const MOVE_DOT_STYLE: CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(20, 20, 20, 0.28) 22%, transparent 23%)',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};
const CAPTURE_RING_STYLE: CSSProperties = { boxShadow: 'inset 0 0 0 4px rgba(20, 20, 20, 0.28)' };
// A glow, not a flat fill like the other square styles above — so a king in
// check reads unmistakably as "danger", never mistaken for a selection or
// hint highlight sharing its square.
const KING_IN_CHECK_STYLE: CSSProperties = {
  boxShadow: 'inset 0 0 0 3px rgba(214, 40, 40, 0.9), inset 0 0 16px 6px rgba(214, 40, 40, 0.55)'
};

function mergeSquareStyles(...maps: Record<string, CSSProperties>[]): Record<string, CSSProperties> {
  const merged: Record<string, CSSProperties> = {};
  for (const map of maps) {
    for (const [square, style] of Object.entries(map)) {
      merged[square] = { ...merged[square], ...style };
    }
  }
  return merged;
}

/** Cosmetic only (always previews a queen) — purely what the board shows
 * while PromotionPicker is open, so the student sees the pawn already
 * sitting on its destination. The actual promotion piece is chosen and
 * committed separately (handlePromotionSelect), never derived from this.
 * Falls back to `fen` unchanged if `pending` no longer applies to it (the
 * render right after an external fen change lands before the effect below
 * has had a chance to clear a stale `pendingPromotion`). */
function previewPromotionFen(fen: string, pending: { from: string; to: string }): string {
  const board = new Chess(fen);
  try {
    board.move({ from: pending.from, to: pending.to, promotion: 'q' });
  } catch {
    return fen;
  }
  return board.fen();
}

export interface BoardArrow {
  from: string;
  to: string;
  color: string;
}

export interface BoardHighlight {
  square: string;
  color: string;
}

export interface CoachBoardProps {
  fen: string;
  orientation: 'white' | 'black';
  /** design.md §5.4: answer mode sends the move as [board_move]; peek mode
   * (move strip / Explore) never sends anything, purely local exploration. */
  mode: 'answer' | 'peek';
  arrows?: BoardArrow[];
  highlights?: BoardHighlight[];
  onUserMove?: (san: string, fen: string, uci: string) => void;
  /** Fired with the student's own right-click-drawn arrows (react-chessboard's
   * built-in drawing, separate from the coach-controlled `arrows` prop) —
   * design.md §5.4/§5.7: lets the composer turn a drawn arrow into an inline
   * chip the student can send. */
  onArrowsChange?: (arrows: BoardArrow[]) => void;
  /** Fired for every legal drop regardless of mode — keeps the displayed
   * position in sync with the drag immediately. react-chessboard is a fully
   * controlled component: its own internal position only updates via an
   * effect keyed on the `fen` prop, so without this the dropped piece snaps
   * back on the next render (most visible on castling, whose two-piece move
   * only animates through that same prop-driven path). Separate from
   * onUserMove, which is answer-mode-only and drives the chat side-effect —
   * peek mode must keep updating the display without notifying the coach. */
  onLocalMove?: (fen: string) => void;
  /** Settings > Board's "show legal moves" toggle (useShowLegalMoveDots) —
   * clicking a piece always selects it and lets you click a destination to
   * move regardless of this flag; the flag only controls whether the
   * chess.com/lichess-style dot/ring indicators are drawn. Defaults on. */
  showLegalMoveDots?: boolean;
  /** True while a move submission this board already triggered
   * (usePlayMoveSubmit/usePlayBotMoveSubmit's isSubmitting) is still in
   * flight — blocks every new drag/click move attempt until it resolves.
   * Without this, `onLocalMove`'s optimistic preview makes a move look
   * fully applied well before the server round trip returns (a real engine
   * search can take several seconds), inviting a second drop that either
   * races the first request or lands as a spurious "Illegal move" once the
   * first has already advanced the position past it. Defaults false so
   * analyze/peek-mode boards, which never submit anything server-side, are
   * unaffected. */
  disabled?: boolean;
}

interface PendingPromotion {
  from: string;
  to: string;
  color: 'w' | 'b';
}

/** Presentational react-chessboard wrapper (AGENTS.md rule 7) — no fetching,
 * no session/turn logic. The parent decides what "answer mode" means (send
 * [board_move], show the undo pill) from onUserMove. */
export function CoachBoard({
  fen,
  orientation,
  mode,
  arrows = [],
  highlights = [],
  onUserMove,
  onLocalMove,
  onArrowsChange,
  showLegalMoveDots = true,
  disabled = false
}: CoachBoardProps): ReactNode {
  const justDroppedRef = useRef(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  // Set instead of moving straight through when a drop/click would promote a
  // pawn — PromotionPicker asks which piece, and the move only actually
  // commits (see handlePromotionSelect) once the student picks one.
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  // A stale selection or an abandoned promotion choice (e.g. the bot's reply
  // just landed, or the student navigated the move strip) would otherwise
  // dot squares, or ask to promote a pawn, from a position that's no longer
  // on the board.
  useEffect(() => {
    setSelectedSquare(null);
    setPendingPromotion(null);
  }, [fen]);

  const chess = new Chess(fen);
  // findPiece returns every match; a legal position has exactly one king per
  // color, so the first (only) result is the one that matters.
  const checkedKingSquare = chess.inCheck() ? chess.findPiece({ type: 'k', color: chess.turn() })[0] : undefined;

  /** Commits a move against `sourceFen` specifically — NOT necessarily the
   * live `fen` prop. handlePromotionSelect needs that distinction: by the
   * time the student picks a piece, `fen` is still the pre-promotion
   * position (the picker is a purely local overlay, see the `position`
   * passed to <Chessboard> below), so replaying from it is correct there;
   * every other caller just passes `fen` itself. */
  function commitMove(sourceFen: string, from: string, to: string, promotion?: PieceSymbol): boolean {
    const board = new Chess(sourceFen);
    if (!promotion) {
      const isPromotion = board
        .moves({ square: from as Square, verbose: true })
        .some((candidate) => candidate.to === to && candidate.promotion);
      if (isPromotion) {
        const piece = board.get(from as Square);
        if (!piece) return false;
        setPendingPromotion({ from, to, color: piece.color });
        return true;
      }
    }

    let move;
    try {
      move = board.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    if (!move) return false;

    setPendingPromotion(null);
    onLocalMove?.(board.fen());
    if (mode === 'answer') {
      onUserMove?.(move.san, board.fen(), `${move.from}${move.to}${move.promotion ?? ''}`);
    }
    return true;
  }

  function applyMove(from: string, to: string): boolean {
    if (disabled) return false;
    return commitMove(fen, from, to);
  }

  function handlePromotionSelect(piece: PromotionPiece): void {
    if (!pendingPromotion) return;
    commitMove(fen, pendingPromotion.from, pendingPromotion.to, piece);
  }

  function handlePromotionCancel(): void {
    setPendingPromotion(null);
  }

  function handlePieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false;
    const applied = applyMove(sourceSquare, targetSquare);
    // A completed pointer-drag from one square to another still ends with a
    // click-ish event landing back on the drag's origin (pointer capture
    // semantics) — swallow the one immediately following a drop so it can't
    // be misread as a click-to-move selection of the square the piece just
    // left.
    if (applied) justDroppedRef.current = true;
    return applied;
  }

  const legalMovesFromSelection = selectedSquare ? chess.moves({ square: selectedSquare, verbose: true }) : [];

  function handleSquareClick(square: string): void {
    if (justDroppedRef.current) {
      justDroppedRef.current = false;
      return;
    }
    if (selectedSquare) {
      if (square === selectedSquare) {
        setSelectedSquare(null);
        return;
      }
      if (legalMovesFromSelection.some((move) => move.to === square)) {
        applyMove(selectedSquare, square);
        setSelectedSquare(null);
        return;
      }
    }

    const piece = chess.get(square as Square);
    setSelectedSquare(piece && piece.color === chess.turn() ? (square as Square) : null);
  }

  // Both wired to the same handler: react-chessboard fires onSquareClick for
  // a click landing on an empty square and onPieceClick for one landing on a
  // piece, each already carrying its own reliable click AND mobile-tap
  // detection (Square/Piece's own onClick + onTouchStart/onTouchEnd) — no
  // need for a custom document-level listener. That used to be necessary
  // because dnd-kit's drag sensor had no activation distance, so it
  // "activated" (swallowing the next native click) on every single
  // pointerdown/touchstart regardless of whether a drag actually happened;
  // the `dragActivationDistance` option below now means a plain tap/click
  // (no real movement) never triggers that at all.
  function handleSquareClickOption({ square }: SquareHandlerArgs): void {
    handleSquareClick(square);
  }
  function handlePieceClickOption({ square }: PieceHandlerArgs): void {
    if (square) handleSquareClick(square);
  }

  const legalMoveSquareStyles: Record<string, CSSProperties> =
    showLegalMoveDots && selectedSquare
      ? Object.fromEntries(
          legalMovesFromSelection.map((move) => [move.to, move.captured ? CAPTURE_RING_STYLE : MOVE_DOT_STYLE])
        )
      : {};

  const options: ChessboardOptions = {
    position: pendingPromotion ? previewPromotionFen(fen, pendingPromotion) : fen,
    boardOrientation: orientation,
    onPieceDrop: handlePieceDrop,
    onSquareClick: handleSquareClickOption,
    onPieceClick: handlePieceClickOption,
    arrows: arrows.map((arrow) => ({ startSquare: arrow.from, endSquare: arrow.to, color: arrow.color })),
    squareStyles: mergeSquareStyles(
      Object.fromEntries(highlights.map((highlight) => [highlight.square, { backgroundColor: highlight.color }])),
      checkedKingSquare ? { [checkedKingSquare]: KING_IN_CHECK_STYLE } : {},
      selectedSquare ? { [selectedSquare]: SELECTED_SQUARE_STYLE } : {},
      legalMoveSquareStyles
    ),
    // dnd-kit's default distance constraint is 1px — a real click/tap almost
    // always jitters past that between pointerdown/pointerup, so nearly
    // every plain click was spinning up full drag-start machinery (droppable
    // rect measurement across all 64 squares) and swallowing the click that
    // would otherwise have reached onSquareClick/onPieceClick above.
    // Raising the threshold means only a deliberate drag (moving well over a
    // square's width) starts that machinery.
    dragActivationDistance: 6,
    allowDrawingArrows: true,
    clearArrowsOnPositionChange: true,
    onArrowsChange: ({ arrows: drawn }: { arrows: Arrow[] }) => {
      onArrowsChange?.(drawn.map((arrow) => ({ from: arrow.startSquare, to: arrow.endSquare, color: arrow.color })));
    }
  };

  const frameClassName = [
    'coach-board-frame',
    mode === 'peek' && 'coach-board-frame--peek',
    disabled && 'coach-board-frame--pending'
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={frameClassName}>
      <Chessboard options={options} />
      {pendingPromotion && (
        <PromotionPicker
          square={pendingPromotion.to}
          color={pendingPromotion.color}
          orientation={orientation}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
      )}
    </div>
  );
}
