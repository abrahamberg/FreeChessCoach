import { act, fireEvent, render, screen } from '@testing-library/react';
import { Chess, type Square } from 'chess.js';
import { describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';

const capturedOptions: ChessboardOptions[] = [];

// Only Chessboard itself is stubbed — PromotionPicker imports `defaultPieces`
// from this same module for its piece icons, so the mock must still provide
// the real one rather than replacing the whole module.
vi.mock('react-chessboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-chessboard')>();
  return {
    ...actual,
    Chessboard: (props: { options: ChessboardOptions }) => {
      capturedOptions.push(props.options);
      return <div data-testid="mock-chessboard" />;
    }
  };
});

// Imported after the mock so CoachBoard picks up the mocked module.
const { CoachBoard } = await import('./CoachBoard.js');

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Mirrors react-chessboard's own dispatch: a click landing on an occupied
// square fires onPieceClick (any piece, either color — the Piece element
// covers the whole square regardless), an empty one fires onSquareClick.
// `fen` is the position CoachBoard was rendered with — fixed per test, since
// CoachBoard doesn't own the fen itself (see its onLocalMove doc comment).
function clickSquare(square: string, fen: string = START_FEN): void {
  const options = capturedOptions.at(-1);
  const piece = new Chess(fen).get(square as Square);
  // handleSquareClick sets state (the selection) — act() flushes that
  // synchronously so the very next capturedOptions.at(-1) read reflects it,
  // the same way fireEvent (which wraps dispatch in act() internally) did
  // when this test drove clicks through real DOM elements.
  act(() => {
    if (piece) {
      options?.onPieceClick?.({ isSparePiece: false, piece: { pieceType: `${piece.color}${piece.type.toUpperCase()}` }, square });
    } else {
      options?.onSquareClick?.({ piece: null, square });
    }
  });
}

describe('CoachBoard', () => {
  test('answer mode: a legal move calls onUserMove with the SAN and resulting fen', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    expect(accepted).toBe(true);
    expect(onUserMove).toHaveBeenCalledWith('e4', expect.stringContaining('4P3'), 'e2e4');
  });

  test('peek mode: a legal move updates the board locally but never calls onUserMove', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    const onLocalMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="peek" onUserMove={onUserMove} onLocalMove={onLocalMove} />);

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    expect(accepted).toBe(true);
    expect(onUserMove).not.toHaveBeenCalled();
    expect(onLocalMove).toHaveBeenCalledWith(expect.stringContaining('4P3'));
  });

  test('answer mode: a legal move also fires onLocalMove, so the drop is reflected immediately', () => {
    capturedOptions.length = 0;
    const onLocalMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onLocalMove={onLocalMove} />);

    const options = capturedOptions.at(-1);
    options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    expect(onLocalMove).toHaveBeenCalledWith(expect.stringContaining('4P3'));
  });

  test('an illegal move never fires onLocalMove', () => {
    capturedOptions.length = 0;
    const onLocalMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onLocalMove={onLocalMove} />);

    const options = capturedOptions.at(-1);
    options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e5'
    });

    expect(onLocalMove).not.toHaveBeenCalled();
  });

  test('an illegal move is rejected (snaps back) and never calls onUserMove', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e5'
    });

    expect(accepted).toBe(false);
    expect(onUserMove).not.toHaveBeenCalled();
  });

  test('castling fires onLocalMove with a fen reflecting both the king and the rook moving', () => {
    capturedOptions.length = 0;
    const onLocalMove = vi.fn();
    const CASTLE_READY_FEN = 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    render(<CoachBoard fen={CASTLE_READY_FEN} orientation="white" mode="answer" onLocalMove={onLocalMove} />);

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wK' } as never,
      sourceSquare: 'e1',
      targetSquare: 'g1'
    });

    expect(accepted).toBe(true);
    // rook jumps from h1 to f1 as part of the same move — onLocalMove's fen
    // must show that too, not just the king's destination.
    expect(onLocalMove).toHaveBeenCalledWith(expect.stringContaining('RNBQ1RK1'));
  });

  test('passes orientation and position through to the underlying board', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="black" mode="answer" />);

    const options = capturedOptions.at(-1);
    expect(options?.boardOrientation).toBe('black');
    expect(options?.position).toBe(START_FEN);
  });

  test('renders arrows and highlights from props', () => {
    capturedOptions.length = 0;
    render(
      <CoachBoard
        fen={START_FEN}
        orientation="white"
        mode="answer"
        arrows={[{ from: 'e2', to: 'e4', color: '#c9762a' }]}
        highlights={[{ square: 'd5', color: '#4a7fb5' }]}
      />
    );

    const options = capturedOptions.at(-1);
    expect(options?.arrows).toEqual([{ startSquare: 'e2', endSquare: 'e4', color: '#c9762a' }]);
    expect(options?.squareStyles?.d5).toMatchObject({ backgroundColor: '#4a7fb5' });
  });

  test('design.md §5.4: peek mode tints the board frame', () => {
    render(<CoachBoard fen={START_FEN} orientation="white" mode="peek" />);
    expect(screen.getByTestId('mock-chessboard').parentElement).toHaveClass('coach-board-frame--peek');
  });

  test('renders nothing extra for screen readers beyond the board itself', () => {
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);
    expect(screen.getByTestId('mock-chessboard')).toBeInTheDocument();
  });

  // useSessionBoardState's `fen` defaults to '' before its positions array has
  // seeded (a real one-render gap: useLivePositions seeds via an effect, which
  // runs one tick after gameQuery.data first resolves) — chess.js's
  // constructor validates and throws on that, and with no error boundary
  // anywhere in the app, an uncaught throw here blanks the whole page. This
  // is the play_bot "the bot starts but the board never shows" bug.
  test('an empty/invalid fen (a transient pre-seed state) does not crash the board', () => {
    expect(() => render(<CoachBoard fen="" orientation="white" mode="answer" />)).not.toThrow();
    expect(screen.getByTestId('mock-chessboard')).toBeInTheDocument();
  });

  test('click-to-move: selecting a piece then clicking a legal destination plays the move', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);

    clickSquare('e2');
    clickSquare('e4');

    expect(onUserMove).toHaveBeenCalledWith('e4', expect.stringContaining('4P3'), 'e2e4');
  });

  test('click-to-move: clicking a legal capture target plays it', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    const CAPTURE_READY_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    render(<CoachBoard fen={CAPTURE_READY_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);

    clickSquare('e4', CAPTURE_READY_FEN);
    clickSquare('d5', CAPTURE_READY_FEN);

    expect(onUserMove).toHaveBeenCalledWith('exd5', expect.any(String), 'e4d5');
  });

  test('click-to-move: clicking the opponent’s piece, or an empty square, with nothing selected does nothing', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);

    clickSquare('e7');
    expect(capturedOptions.at(-1)?.squareStyles?.e7).toBeUndefined();

    clickSquare('e3');
    expect(capturedOptions.at(-1)?.squareStyles?.e3).toBeUndefined();
  });

  test('click-to-move: clicking the selected square again deselects it', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);

    clickSquare('e2');
    expect(capturedOptions.at(-1)?.squareStyles?.e4).toBeDefined();

    clickSquare('e2');
    expect(capturedOptions.at(-1)?.squareStyles?.e4).toBeUndefined();
  });

  test('selecting a piece dots its legal destinations by default, and rings a capturable one', () => {
    capturedOptions.length = 0;
    const CAPTURE_READY_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    render(<CoachBoard fen={CAPTURE_READY_FEN} orientation="white" mode="answer" />);

    clickSquare('e4', CAPTURE_READY_FEN);

    const withSelection = capturedOptions.at(-1);
    expect(withSelection?.squareStyles?.e5).toMatchObject({ backgroundImage: expect.stringContaining('radial-gradient') });
    expect(withSelection?.squareStyles?.d5).toMatchObject({ boxShadow: expect.stringContaining('inset') });
  });

  test('showLegalMoveDots=false suppresses the dots but click-to-move still works', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(
      <CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} showLegalMoveDots={false} />
    );

    clickSquare('e2');
    expect(capturedOptions.at(-1)?.squareStyles?.e4).toBeUndefined();

    clickSquare('e4');
    expect(onUserMove).toHaveBeenCalledWith('e4', expect.stringContaining('4P3'), 'e2e4');
  });

  test('a click right after a drag-drop is not misread as a click-to-move selection', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);

    capturedOptions.at(-1)?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    // The browser still synthesizes a "click" at mouseup after a completed
    // drag. Clicking e2 (still a white pawn — CoachBoard doesn't own the fen
    // itself, so this test's fen prop is unchanged) would normally select it
    // and dot e4; the guard should swallow this one stray click instead.
    clickSquare('e2');

    expect(capturedOptions.at(-1)?.squareStyles?.e4).toBeUndefined();

    // A genuine next click still works normally — only the one immediately
    // after the drop is swallowed.
    clickSquare('e2');
    expect(capturedOptions.at(-1)?.squareStyles?.e4).toBeDefined();
  });

  test('allows drawing arrows and reports the student-drawn set through onArrowsChange, distinct from the coach-controlled arrows prop', () => {
    capturedOptions.length = 0;
    const onArrowsChange = vi.fn();
    render(
      <CoachBoard
        fen={START_FEN}
        orientation="white"
        mode="answer"
        arrows={[{ from: 'e2', to: 'e4', color: '#c9762a' }]}
        onArrowsChange={onArrowsChange}
      />
    );

    const options = capturedOptions.at(-1);
    expect(options?.allowDrawingArrows).toBe(true);
    options?.onArrowsChange?.({ arrows: [{ startSquare: 'g8', endSquare: 'f6', color: 'green' }] });

    expect(onArrowsChange).toHaveBeenCalledWith([{ from: 'g8', to: 'f6', color: 'green' }]);
  });

  test('clears drawn arrows automatically when the position changes (design.md §5.4-style auto-clear)', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);
    expect(capturedOptions.at(-1)?.clearArrowsOnPositionChange).toBe(true);
  });

  // A move submission already in flight (usePlayMoveSubmit/
  // usePlayBotMoveSubmit's isSubmitting) — without this, the board's own
  // optimistic onLocalMove preview makes a move look fully applied well
  // before a slow server round trip actually returns, inviting a second
  // drop that either races the first request or lands as a spurious
  // "Illegal move" once the first has already advanced the position.
  test('disabled: a drag no longer fires onUserMove or onLocalMove', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    const onLocalMove = vi.fn();
    render(
      <CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} onLocalMove={onLocalMove} disabled />
    );

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    expect(accepted).toBe(false);
    expect(onUserMove).not.toHaveBeenCalled();
    expect(onLocalMove).not.toHaveBeenCalled();
  });

  test('disabled: click-to-move no longer plays a move', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} disabled />);

    clickSquare('e2');
    clickSquare('e4');

    expect(onUserMove).not.toHaveBeenCalled();
  });

  test('disabled: tints the board frame so a pending submission is visible', () => {
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" disabled />);
    expect(screen.getByTestId('mock-chessboard').parentElement).toHaveClass('coach-board-frame--pending');
  });

  test('not disabled by default: a drag still plays normally', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);

    const options = capturedOptions.at(-1);
    const accepted = options?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'e2',
      targetSquare: 'e4'
    });

    expect(accepted).toBe(true);
    expect(onUserMove).toHaveBeenCalled();
  });

  test('moveQualityBadge draws the on-board badge; omitted draws nothing', () => {
    const { rerender } = render(<CoachBoard fen={START_FEN} orientation="white" mode="peek" />);
    expect(screen.queryByText('✓')).not.toBeInTheDocument();

    rerender(<CoachBoard fen={START_FEN} orientation="white" mode="peek" moveQualityBadge={{ square: 'e4', quality: 'good' }} />);
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});

// Black king e8, white pawn a7, white king e1 — nothing else on the board,
// so a7-a8 is an unambiguous promotion with no incidental check either way.
const PROMOTION_READY_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
const CHECK_FEN = '4k3/8/8/8/8/8/4q3/4K3 w - - 0 1';

describe('CoachBoard — king in check', () => {
  test('highlights the checked king’s square', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={CHECK_FEN} orientation="white" mode="answer" />);

    expect(capturedOptions.at(-1)?.squareStyles?.e1).toMatchObject({
      boxShadow: expect.stringContaining('214, 40, 40')
    });
  });

  test('highlights nothing when no king is in check', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);

    const options = capturedOptions.at(-1);
    expect(options?.squareStyles?.e1).toBeUndefined();
    expect(options?.squareStyles?.e8).toBeUndefined();
  });
});

// Drops a pawn onto the promotion rank — wrapped in act() since (unlike the
// other onPieceDrop-based tests above) the assertions here depend on the
// resulting pendingPromotion state actually being flushed to the DOM.
function dropPromotingPawn(): boolean | undefined {
  let accepted: boolean | undefined;
  act(() => {
    accepted = capturedOptions.at(-1)?.onPieceDrop?.({
      piece: { pieceType: 'wP' } as never,
      sourceSquare: 'a7',
      targetSquare: 'a8'
    });
  });
  return accepted;
}

describe('CoachBoard — pawn promotion', () => {
  test('dropping a pawn onto the last rank opens a picker instead of queening immediately', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    const onLocalMove = vi.fn();
    render(
      <CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" onUserMove={onUserMove} onLocalMove={onLocalMove} />
    );

    const accepted = dropPromotingPawn();

    expect(accepted).toBe(true);
    expect(onUserMove).not.toHaveBeenCalled();
    expect(onLocalMove).not.toHaveBeenCalled();
    expect(screen.getByRole('menu', { name: /choose a piece/i })).toBeInTheDocument();
    for (const label of ['Queen', 'Knight', 'Rook', 'Bishop']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  test('previews the pawn as a queen on the board while the picker is open, without committing', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" />);

    dropPromotingPawn();

    expect(capturedOptions.at(-1)?.position).toEqual(expect.stringContaining('Q'));
  });

  test('click-to-move onto the last rank also opens the picker', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" />);

    clickSquare('a7', PROMOTION_READY_FEN);
    clickSquare('a8', PROMOTION_READY_FEN);

    expect(screen.getByRole('menu', { name: /choose a piece/i })).toBeInTheDocument();
  });

  test('picking a piece commits the move with that promotion', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    render(<CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" onUserMove={onUserMove} />);
    dropPromotingPawn();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Knight' }));

    expect(onUserMove).toHaveBeenCalledWith('a8=N', expect.any(String), 'a7a8n');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking outside the choices cancels — nothing commits and the board reverts', () => {
    capturedOptions.length = 0;
    const onUserMove = vi.fn();
    const onLocalMove = vi.fn();
    const { container } = render(
      <CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" onUserMove={onUserMove} onLocalMove={onLocalMove} />
    );
    dropPromotingPawn();

    fireEvent.click(container.querySelector('.promotion-picker-backdrop')!);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onUserMove).not.toHaveBeenCalled();
    expect(onLocalMove).not.toHaveBeenCalled();
    expect(capturedOptions.at(-1)?.position).toBe(PROMOTION_READY_FEN);
  });

  test('pressing Escape cancels the picker', () => {
    capturedOptions.length = 0;
    render(<CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" />);
    dropPromotingPawn();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('a new position while the picker is open abandons it', () => {
    capturedOptions.length = 0;
    const { rerender } = render(<CoachBoard fen={PROMOTION_READY_FEN} orientation="white" mode="answer" />);
    dropPromotingPawn();
    expect(screen.getByRole('menu')).toBeInTheDocument();

    rerender(<CoachBoard fen={START_FEN} orientation="white" mode="answer" />);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
