import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions, PieceDropHandlerArgs } from 'react-chessboard';
import type { ReactNode } from 'react';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { useDivergedLine } from './useDivergedLine.js';
import { useSessionBoardState } from './useSessionBoardState.js';
import { useWasmEngine } from '../../hooks/useWasmEngine.js';

const capturedOptions: ChessboardOptions[] = [];

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options: ChessboardOptions }) => {
    capturedOptions.push(props.options);
    return <div data-testid="mock-chessboard" />;
  }
}));

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const POSITIONS = [{ ply: 0, fen: START_FEN, moveUci: null }];

interface HarnessProps {
  sessionMode: 'analyze' | 'play' | 'play_bot';
  sendMessage?: (content: string) => void;
  onPlayMoveCommitted?: (result: { fen: string; san: string; ply: number }, uci: string) => void;
  sanMoves?: string[];
  onUndoMove?: () => void;
  undoDisabled?: boolean;
  positions?: { ply: number; fen: string; moveUci: string | null }[];
  showEvalIndicators?: boolean;
  isSideBySide?: boolean;
  isDesktop?: boolean;
}

function Harness({
  sessionMode,
  sendMessage = () => undefined,
  onPlayMoveCommitted = () => undefined,
  sanMoves = [],
  onUndoMove,
  undoDisabled,
  positions = POSITIONS,
  showEvalIndicators,
  isSideBySide = true,
  isDesktop = true
}: HarnessProps): ReactNode {
  const boardState = useSessionBoardState(positions);
  const divergedLine = useDivergedLine();
  const engine = useWasmEngine();

  return (
    <SessionBoardColumn
      boardState={boardState}
      divergedLine={divergedLine}
      currentRealPosition={{ ply: boardState.ply, fen: boardState.fen }}
      orientation="white"
      sanMoves={sanMoves}
      positions={positions}
      classifiedMoves={[]}
      isDesktop={isDesktop}
      isSideBySide={isSideBySide}
      engine={engine}
      autoplayIntervalMs={1000}
      onChangeAutoplayInterval={() => undefined}
      sendMessage={sendMessage}
      onArrowsChange={() => undefined}
      sessionMode={sessionMode}
      sessionId="session-1"
      onPlayMoveCommitted={onPlayMoveCommitted}
      onUndoMove={onUndoMove}
      undoDisabled={undoDisabled}
      showEvalIndicators={showEvalIndicators}
    />
  );
}

function dropE2E4(): void {
  const options = capturedOptions.at(-1);
  act(() => {
    options?.onPieceDrop?.({
      piece: { pieceType: 'wP' },
      sourceSquare: 'e2',
      targetSquare: 'e4'
    } as PieceDropHandlerArgs);
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SessionBoardColumn — play mode (architecture §14)', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a board drop commits the move via POST /play-move before sending the [player_move] chat message', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((path: string) => {
      calls.push(path);
      return Promise.resolve(jsonResponse({ fen: 'fen-after-e4', san: 'e4', ply: 1, quality: 'best' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const sendMessage = vi.fn((content: string) => calls.push(`sendMessage:${content}`));
    const onPlayMoveCommitted = vi.fn();

    render(<Harness sessionMode="play" sendMessage={sendMessage} onPlayMoveCommitted={onPlayMoveCommitted} />);
    await screen.findByTestId('mock-chessboard');

    dropE2E4();

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/session-1/play-move',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ san: 'e4' }) })
    );
    expect(onPlayMoveCommitted).toHaveBeenCalledWith({ fen: 'fen-after-e4', san: 'e4', ply: 1, quality: 'best' }, 'e2e4');
    expect(sendMessage).toHaveBeenCalledWith('[player_move] I played e4.');
    // Ordering: the POST must resolve (and its result applied) before the chat turn starts.
    expect(calls).toEqual(['/api/sessions/session-1/play-move', 'sendMessage:[player_move] I played e4.']);
  });

  test('a 422 illegal-move rejection shows an inline error and never sends a chat message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ type: 'about:blank', title: 'Illegal move: e4', status: 422 }, 422)
    );
    vi.stubGlobal('fetch', fetchMock);
    const sendMessage = vi.fn();
    const onPlayMoveCommitted = vi.fn();

    render(<Harness sessionMode="play" sendMessage={sendMessage} onPlayMoveCommitted={onPlayMoveCommitted} />);
    await screen.findByTestId('mock-chessboard');

    dropE2E4();

    expect(await screen.findByText(/illegal move: e4/i)).toBeInTheDocument();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(onPlayMoveCommitted).not.toHaveBeenCalled();
  });

  test('analyze mode never calls /play-move — a drop still goes through the existing diverged-line path', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const sendMessage = vi.fn();

    render(<Harness sessionMode="analyze" sendMessage={sendMessage} />);
    await screen.findByTestId('mock-chessboard');

    dropE2E4();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/undo last move/i)).toBeInTheDocument();
  });
});

// A slow /play-move (a real engine search can take several seconds) leaves
// the board's own optimistic onLocalMove preview looking fully "done" with
// no visual sign a request is still pending — without a guard, an
// impatient second drop either double-submits (racing the first request)
// or lands as a spurious "Illegal move" once the first has already
// advanced the position past it.
describe('SessionBoardColumn — blocks a second drop while a move is still in flight', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('play mode: the board frame tints pending, and a second drop is ignored, until the request resolves', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness sessionMode="play" />);
    await screen.findByTestId('mock-chessboard');

    dropE2E4();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('mock-chessboard').parentElement).toHaveClass('coach-board-frame--pending');

    // A second drop attempt while the first is still pending must not fire
    // a second request.
    dropE2E4();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(jsonResponse({ fen: 'fen-after-e4', san: 'e4', ply: 1, quality: 'best' }));
    });
    await waitFor(() => expect(screen.getByTestId('mock-chessboard').parentElement).not.toHaveClass('coach-board-frame--pending'));
  });

  test('play_bot mode: a second drop is ignored while the first is still in flight', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness sessionMode="play_bot" />);
    await screen.findByTestId('mock-chessboard');

    dropE2E4();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    dropE2E4();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(
        jsonResponse({
          player: { fen: 'fen-after-e4', san: 'e4', ply: 1, quality: 'best', elapsedMs: 1000 },
          bot: { fen: 'fen-after-e5', san: 'e5', ply: 2, quality: 'best', elapsedMs: 900 },
          gameOver: null,
          whiteRemainingMs: null,
          blackRemainingMs: null
        })
      );
    });
    await waitFor(() => expect(screen.getByTestId('mock-chessboard').parentElement).not.toHaveClass('coach-board-frame--pending'));
  });
});

describe('SessionBoardColumn — "Explore on your own" (live play modes)', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  test('is offered in analyze mode', async () => {
    render(<Harness sessionMode="analyze" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.getByText(/explore on your own/i)).toBeInTheDocument();
  });

  test('is not offered in play mode', async () => {
    render(<Harness sessionMode="play" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByText(/explore on your own/i)).not.toBeInTheDocument();
  });

  test('is not offered in play_bot mode', async () => {
    render(<Harness sessionMode="play_bot" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByText(/explore on your own/i)).not.toBeInTheDocument();
  });
});

describe('SessionBoardColumn — play_bot move navigation and undo', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  test('renders back/forward and, when onUndoMove is provided, an Undo button', async () => {
    const onUndoMove = vi.fn();
    render(<Harness sessionMode="play_bot" sanMoves={['e4', 'e5']} onUndoMove={onUndoMove} />);
    await screen.findByTestId('mock-chessboard');

    expect(screen.getByLabelText('Previous move')).toBeInTheDocument();
    expect(screen.getByLabelText('Next move')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Undo'));
    expect(onUndoMove).toHaveBeenCalledTimes(1);
  });

  test('the Undo button is disabled when undoDisabled is true', async () => {
    render(<Harness sessionMode="play_bot" sanMoves={['e4', 'e5']} onUndoMove={() => undefined} undoDisabled />);
    await screen.findByTestId('mock-chessboard');

    expect(screen.getByText('Undo')).toBeDisabled();
  });

  test('no toolbar renders outside play_bot mode', async () => {
    render(<Harness sessionMode="play" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByLabelText('Previous move')).not.toBeInTheDocument();
  });
});

// White rook e3, black queen e5, kings at e8/e1 — an unambiguous fixture
// with one clearly-best move (Rxe5+) for the engine to suggest.
const HANGING_PIECES_FEN = '4k3/8/8/4q3/8/4R3/8/4K3 w - - 0 1';
const HANGING_PIECES_POSITIONS = [{ ply: 0, fen: HANGING_PIECES_FEN, moveUci: null }];

// A Response body can only be read once, so every fetch resolution needs its
// own instance — a single shared one would break the second test to consume it.
function topMovesResponse(): Response {
  return jsonResponse({
    lines: [
      { moveUci: 'e3e5', moveSan: 'Rxe5+', cp: 900, mateIn: null },
      { moveUci: 'e1d2', moveSan: 'Kd2', cp: 10, mateIn: null }
    ]
  });
}

describe('SessionBoardColumn — play_bot hint', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The bot's own moves are computed server-side (the reliable path — the
  // native engine, same as commitBotTurn) — this reuses that same path
  // (POST /api/positions/hint-moves) rather than the in-browser WASM engine,
  // which has no such reliability guarantee across every user's browser.
  test('stage 1 fetches the engine\'s top moves and highlights the squares of the pieces to move, with no arrows yet', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(topMovesResponse()));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByText('Hint'));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/positions/hint-moves',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen: HANGING_PIECES_FEN }) })
    );
    await waitFor(() => expect(capturedOptions.at(-1)?.squareStyles?.e3).toBeDefined());
    const options = capturedOptions.at(-1);
    expect(options?.squareStyles?.e3).toMatchObject({ backgroundColor: expect.stringContaining('color-mix') });
    expect(options?.squareStyles?.e1).toMatchObject({ backgroundColor: expect.stringContaining('color-mix') });
    expect(options?.arrows).toEqual([]);
  });

  test('stage 2 draws arrows to the same moves\' destinations, without a second fetch', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(topMovesResponse()));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByText('Hint'));
    await waitFor(() => expect(capturedOptions.at(-1)?.squareStyles?.e3).toBeDefined());
    fireEvent.click(screen.getByText('Hint'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = capturedOptions.at(-1);
    expect(options?.arrows).toEqual(
      expect.arrayContaining([expect.objectContaining({ startSquare: 'e3', endSquare: 'e5' })])
    );
    // The piece highlight from stage 1 stays up alongside the new arrow.
    expect(options?.squareStyles?.e3).toBeDefined();
  });

  // The color highlights/arrows carry the hint's actual content visually —
  // a screen reader has no way to read a square's fill or an arrow's color,
  // so the same information (which moves are suggested) must still reach it
  // through the visually-hidden status region once loaded, not just a
  // transient "Getting a hint…" that goes silent forever after.
  test('once loaded, the hint result is still announced for screen readers even though the bubble is gone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(topMovesResponse())));
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByText('Hint'));

    expect(await screen.findByText(/top moves: rxe5\+, kd2/i)).toBeInTheDocument();
  });

  test('a third click collapses the hint, and a new position resets it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(topMovesResponse())));
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByText('Hint'));
    await waitFor(() => expect(capturedOptions.at(-1)?.squareStyles?.e3).toBeDefined());
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));

    const options = capturedOptions.at(-1);
    expect(options?.squareStyles?.e3).toBeUndefined();
    expect(options?.arrows).toEqual([]);
  });

  test('a failed request is announced for screen readers instead of hanging forever', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByText('Hint'));

    expect(await screen.findByText(/couldn't get a suggestion/i)).toBeInTheDocument();
  });

  test('a late response for an abandoned request is ignored', async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(jsonResponse({ lines: [{ moveUci: 'e1d2', moveSan: 'Kd2', cp: 10, mateIn: null }] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness sessionMode="play_bot" positions={HANGING_PIECES_POSITIONS} />);
    await screen.findByTestId('mock-chessboard');

    // Stage 1 (first, never-resolving fetch) -> stage 2 -> collapse -> stage 1 (second fetch) -> stage 2.
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));
    fireEvent.click(screen.getByText('Hint'));

    await waitFor(() =>
      expect(capturedOptions.at(-1)?.arrows).toEqual(
        expect.arrayContaining([expect.objectContaining({ startSquare: 'e1', endSquare: 'd2' })])
      )
    );

    // The first request finally resolves — it must not clobber the second one's result.
    resolveFirst?.(jsonResponse({ lines: [] }));
    await Promise.resolve();
    expect(capturedOptions.at(-1)?.arrows).toEqual(
      expect.arrayContaining([expect.objectContaining({ startSquare: 'e1', endSquare: 'd2' })])
    );
  });
});

// Mobile's move strip (rendered only when !isDesktop) shares MoveStrip with
// GameReviewPage's MoveNavStrip, but converts the app's 1-based ply
// (positions/classifiedMoves/useSessionBoardState's own convention) to
// MoveStrip's 0-based sanMoves-index convention itself, separately from
// MoveNavStrip's own conversion — the exact kind of duplicated arithmetic
// that drifts out of sync, which is what happened here.
describe('SessionBoardColumn — mobile move strip ply conversion', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  const POSITIONS_TWO_MOVES = [
    { ply: 0, fen: 'fen-start', moveUci: null },
    { ply: 1, fen: 'fen-after-e4', moveUci: 'e2e4' },
    { ply: 2, fen: 'fen-after-e5', moveUci: 'e7e5' }
  ];

  test('tapping the first move chip navigates to the position just after that move, not the game start', async () => {
    render(
      <Harness sessionMode="analyze" sanMoves={['e4', 'e5']} positions={POSITIONS_TWO_MOVES} isDesktop={false} />
    );
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByRole('button', { name: 'e4' }));

    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe('fen-after-e4'));
  });

  test('the chip marked as current always matches the position actually shown on the board', async () => {
    render(
      <Harness sessionMode="analyze" sanMoves={['e4', 'e5']} positions={POSITIONS_TWO_MOVES} isDesktop={false} />
    );
    await screen.findByTestId('mock-chessboard');

    fireEvent.click(screen.getByRole('button', { name: 'e5' }));

    await waitFor(() => expect(capturedOptions.at(-1)?.position).toBe('fen-after-e5'));
    expect(screen.getByRole('button', { name: 'e5' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'e4' })).not.toHaveAttribute('aria-current');
  });
});

describe('SessionBoardColumn — showEvalIndicators', () => {
  test('defaults to shown', async () => {
    render(<Harness sessionMode="play_bot" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.getByLabelText(/evaluation:/i)).toBeInTheDocument();
  });

  test('hides the eval bar when explicitly turned off (BotSessionPage\'s "hide status bar" option)', async () => {
    render(<Harness sessionMode="play_bot" showEvalIndicators={false} />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByLabelText(/evaluation:/i)).not.toBeInTheDocument();
  });

  // Mobile's single-column layout (design ask: make the board as big as
  // possible) — the vertical bar beside the board would eat into its width,
  // the scarcer dimension on a phone screen, so it moves above instead.
  test('below the side-by-side breakpoint, renders as a horizontal strip above the board instead of beside it', async () => {
    render(<Harness sessionMode="play_bot" isSideBySide={false} />);
    await screen.findByTestId('mock-chessboard');

    const evalBar = screen.getByLabelText(/evaluation:/i);
    expect(evalBar.parentElement).toHaveClass('eval-bar-wrap--horizontal');
    expect(document.querySelector('.session-board-row .eval-bar-wrap')).not.toBeInTheDocument();
  });

  test('at/above the side-by-side breakpoint, renders as a vertical bar inside the board row', async () => {
    render(<Harness sessionMode="play_bot" isSideBySide />);
    await screen.findByTestId('mock-chessboard');

    const evalBar = screen.getByLabelText(/evaluation:/i);
    expect(evalBar.parentElement).not.toHaveClass('eval-bar-wrap--horizontal');
    expect(document.querySelector('.session-board-row .eval-bar-wrap')).toBeInTheDocument();
  });
});
