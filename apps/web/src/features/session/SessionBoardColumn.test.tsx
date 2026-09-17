import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions, PieceDropHandlerArgs } from 'react-chessboard';
import type { ReactNode } from 'react';
import { useExploreFeedback } from '../board/useExploreFeedback.js';
import { SessionBoardColumn } from './SessionBoardColumn.js';
import { useDivergedLine } from './useDivergedLine.js';
import { useSessionBoardState } from './useSessionBoardState.js';

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
  isDesktop = true
}: HarnessProps): ReactNode {
  const boardState = useSessionBoardState(positions);
  const divergedLine = useDivergedLine();
  // Mirrors SessionPage's own ownership of "Explore on your own" state
  // (isExploring lives above SessionBoardColumn now, for the mobile "coach
  // box" swap) — the harness has to reproduce that wiring, not just render
  // the column, for the explore tests below to exercise anything real.
  const [isExploring, setIsExploring] = useState(false);
  useEffect(() => {
    if (boardState.mode !== 'peek') setIsExploring(false);
  }, [boardState.mode]);
  const exploreFeedback = useExploreFeedback({ enabled: isExploring, fen: boardState.fen, lastMove: boardState.lastLocalMove });

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
      isExploring={isExploring}
      onOpenExplore={() => {
        setIsExploring(true);
        boardState.setMode('peek');
      }}
      onCloseExplore={boardState.backToCoach}
      exploreFeedback={exploreFeedback}
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('is offered in analyze mode', async () => {
    render(<Harness sessionMode="analyze" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.getByRole('button', { name: /explore on your own/i })).toBeInTheDocument();
  });

  test('is not offered in play mode', async () => {
    render(<Harness sessionMode="play" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByRole('button', { name: /explore on your own/i })).not.toBeInTheDocument();
  });

  test('is not offered in play_bot mode', async () => {
    render(<Harness sessionMode="play_bot" />);
    await screen.findByTestId('mock-chessboard');
    expect(screen.queryByRole('button', { name: /explore on your own/i })).not.toBeInTheDocument();
  });

  test('opening the sandbox calls the engine pipeline for the current position, shows a word-based eval on the pill, and a "not played yet" prompt in the coach box (desktop)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness sessionMode="analyze" />);
    await screen.findByTestId('mock-chessboard');
    fireEvent.click(screen.getByRole('button', { name: /explore on your own/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/positions/hint-moves',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen: START_FEN }) })
    );
    await waitFor(() => expect(document.querySelector('.explore-panel-pill')).toHaveTextContent(/roughly equal|better|winning/i));
    // The coach box already renders (desktop) so it's there the moment
    // exploring starts, but with nothing to flag yet — not the same
    // no-note-until-you-explore gap the old below-the-board-only version had.
    expect(document.querySelector('.explore-note-card--empty')).toBeInTheDocument();
  });

  test('playing a move in the sandbox re-analyzes and renders a coach-box note for it, plus board arrows for the reply', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: { body: string }) => {
      const { fen } = JSON.parse(init.body) as { fen: string };
      if (fen === START_FEN) {
        return Promise.resolve(jsonResponse({ lines: [{ moveUci: 'e2e4', moveSan: 'e4', cp: 30, mateIn: null }] }));
      }
      return Promise.resolve(
        jsonResponse({
          lines: [
            { moveUci: 'e7e5', moveSan: 'e5', cp: 25, mateIn: null },
            { moveUci: 'c7c5', moveSan: 'c5', cp: 20, mateIn: null }
          ]
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<Harness sessionMode="analyze" />);
    await screen.findByTestId('mock-chessboard');
    fireEvent.click(screen.getByRole('button', { name: /explore on your own/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    dropE2E4();

    await waitFor(() => expect(document.querySelector('.explore-note-card')).toBeInTheDocument());
    expect(screen.getByText('e4')).toBeInTheDocument();
    const options = capturedOptions.at(-1);
    expect(options?.arrows?.length).toBeGreaterThan(0);
    // Same live treatment Game Review's board gives a real position — the
    // eval bar and the on-board move-quality icon both track the sandbox
    // move instead of sitting frozen/blank.
    expect(document.querySelector('.eval-bar')).toHaveAttribute('aria-label', expect.stringMatching(/Evaluation: \+0\.[23]/));
    expect(document.querySelector('[class*="move-quality-badge-overlay"]')).toBeInTheDocument();
  });

  // coach-method.ts already tells the coach "the student can build [a
  // hypothetical] themselves by moving pieces on the board — those moves
  // reach you together with their comment", but a move played while
  // exploring (board mode 'peek') never fired onUserMove — only the
  // fen-only local preview — so it silently never reached divergedLine at
  // all. Sending afterwards fell back to [position_context], which only
  // names the real move at the peeked ply, losing every move actually
  // explored. The undo pill only renders once divergedLine.line is set
  // (see the "analyze mode ... still goes through the existing
  // diverged-line path" test above for the answer-mode equivalent of this
  // assertion).
  test('a move played while exploring builds a diverged line too, not just a silent local preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ lines: [] })));

    render(<Harness sessionMode="analyze" />);
    await screen.findByTestId('mock-chessboard');
    fireEvent.click(screen.getByRole('button', { name: /explore on your own/i }));

    dropE2E4();

    expect(await screen.findByText(/undo last move/i)).toBeInTheDocument();
  });

  test('the diverged line built while exploring shows up in the mobile panel with the real move numbering', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ lines: [] })));

    render(<Harness sessionMode="analyze" isDesktop={false} />);
    await screen.findByTestId('mock-chessboard');
    fireEvent.click(screen.getByRole('button', { name: /explore on your own/i }));

    dropE2E4();

    expect(await screen.findByText(/diverged line — from move 1 \(white\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument();
  });
});

// Desktop only (Harness defaults isDesktop to true) — the toolbar keeps its
// own Previous/Next pair there since the sidebar's MoveExplorer (rendered by
// SessionPage/BotSessionPage, not this component) has a separate set of nav
// pills of its own, not a bare move strip these would otherwise duplicate.
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

// Mobile's move row (rendered only when !isDesktop) is MoveNavStrip — the
// same combined chevrons + move-chip list GameReviewPage's mobile Review
// page uses — passed the app's own 1-based ply directly; MoveNavStrip owns
// the conversion to MoveStrip's 0-based sanMoves-index convention internally
// (plyToMoveStripIndex/moveStripIndexToPly), so this file no longer
// re-derives that arithmetic itself.
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

// On mobile, every session mode gets the same combined row Game Review
// already uses (MoveNavStrip: step chevrons + the move-chip list in one
// line) instead of a bare, buttonless chip list — and play_bot mode must not
// end up with two redundant pairs of step buttons once its own toolbar and
// this row both exist on screen.
describe('SessionBoardColumn — mobile combined move-nav row', () => {
  beforeEach(() => {
    capturedOptions.length = 0;
  });

  test('analyze mode gets step chevrons alongside the move chips, not just a bare list', async () => {
    render(<Harness sessionMode="analyze" sanMoves={['e4', 'e5']} isDesktop={false} />);
    await screen.findByTestId('mock-chessboard');

    expect(screen.getByLabelText('previous move')).toBeInTheDocument();
    expect(screen.getByLabelText('next move')).toBeInTheDocument();
  });

  test('play_bot mode shows exactly one pair of step buttons, not the toolbar\'s own pair on top of the combined row\'s', async () => {
    render(<Harness sessionMode="play_bot" sanMoves={['e4', 'e5']} onUndoMove={() => undefined} isDesktop={false} />);
    await screen.findByTestId('mock-chessboard');

    expect(screen.getByLabelText('previous move')).toBeInTheDocument();
    expect(screen.getByLabelText('next move')).toBeInTheDocument();
    expect(screen.queryByLabelText('Previous move')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next move')).not.toBeInTheDocument();

    // Undo/Hint survive the toolbar's own step buttons being dropped.
    expect(screen.getByText('Undo')).toBeInTheDocument();
    expect(screen.getByText('Hint')).toBeInTheDocument();
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

  // Always a vertical bar beside the board (design ask: consistent across
  // every viewport width, freeing the row mobile used to spend on a
  // horizontal strip above the board).
  test('renders as a vertical bar inside the board row, beside the board', async () => {
    render(<Harness sessionMode="play_bot" />);
    await screen.findByTestId('mock-chessboard');

    expect(screen.getByLabelText(/evaluation:/i)).toBeInTheDocument();
    expect(document.querySelector('.session-board-row .eval-bar-wrap')).toBeInTheDocument();
  });
});
