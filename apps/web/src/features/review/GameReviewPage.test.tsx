import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ChessboardOptions } from 'react-chessboard';
import { TACTIC_MOTIF_TYPES, type AnalysisStatus, type ClassifiedMoveDto, type GameReport, type GameReviewTier, type PlayerReport } from '@freechesscoach/shared';

const capturedOptions: ChessboardOptions[] = [];

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options: ChessboardOptions }) => {
    capturedOptions.push(props.options);
    return <div data-testid="mock-chessboard" />;
  }
}));

const { GameReviewPage } = await import('./GameReviewPage.js');

const PGN = '[White "daniel"]\n[Black "Marta"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 *';

function buildPlayerReport(): PlayerReport {
  return {
    accuracy: 87.4,
    phaseAccuracy: { opening: 92.1, middlegame: 80.5, endgame: null },
    phaseConfidence: { opening: 'ok', middlegame: 'ok', endgame: 'none' },
    scores: { opening: 90, tactics: 75, strategy: 82, endgame: null },
    strategySubScores: { pawnStructure: 80, spaceAdvantage: 78, activePiece: 85, attacking: 70, defending: 88 },
    endgame: { standing: null, theme: null },
    counts: { brilliant: 0, great: 0, best: 1, excellent: 0, good: 1, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0 },
    acpl: 10,
    estimatedRating: { value: 1550, range: [1400, 1700], confidence: 'medium' },
    tacticMotifs: Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as PlayerReport['tacticMotifs']
  };
}

function buildGameReport(moves: ClassifiedMoveDto[]): GameReport {
  return {
    engine: { name: 'stockfish', depth: 16, multiPv: 1 },
    book: {
      source: 'test-fixture@1',
      eco: null,
      ecoVolume: null,
      name: null,
      family: null,
      variation: null,
      namedAtPly: null,
      lastBookPly: 0,
      players: {
        white: { lastBookPly: 0, leftBookPly: null, leftBookMove: null, bookAlternatives: [] },
        black: { lastBookPly: 0, leftBookPly: null, leftBookMove: null, bookAlternatives: [] }
      }
    },
    phases: { openingEndPly: 0, endgameStartPly: null, openingSource: 'book' },
    players: { white: buildPlayerReport(), black: buildPlayerReport() },
    moves
  };
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
}

interface GameFixture {
  reviewTier?: GameReviewTier;
  analysisStatus?: AnalysisStatus;
  classifiedMoves?: unknown[] | null;
  liveMoveQualities?: unknown[] | null;
  gameReport?: unknown | null;
}

function mockFetch(game: GameFixture = {}) {
  return vi.fn().mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/api/games/game-1') {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'game-1',
            pgn: PGN,
            userColor: 'white',
            whiteName: 'daniel',
            blackName: 'Marta',
            result: '1-0',
            classifiedMoves: game.classifiedMoves ?? null,
            liveMoveQualities: game.liveMoveQualities ?? null,
            reviewTier: game.reviewTier ?? 'imported',
            analysisStatus: game.analysisStatus ?? 'ready',
            gameReport: game.gameReport ?? null
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    }
    if (path === '/api/games/game-1/promote' && init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ reviewTier: 'coach' }), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }
    if (path === '/api/sessions' && init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'session-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }
    throw new Error(`unexpected fetch: ${path}`);
  });
}

function renderReviewPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/review/game-1']}>
        <Routes>
          <Route path="/review/:gameId" element={<GameReviewPage />} />
          <Route path="/games" element={<div>games-page-marker</div>} />
          <Route path="/session/:id" element={<div>session-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('GameReviewPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    capturedOptions.length = 0;
    window.localStorage.clear();
  });

  test('shows the players once the game loads, with no chat pane', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    renderReviewPage();

    expect(await screen.findByText(/daniel/)).toBeInTheDocument();
    expect(screen.getByText(/marta/i)).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  // The board is for looking, not playing — CoachBoard's own `disabled`
  // (not just mode="peek", which alone still lets a move be made/previewed
  // locally) is what actually blocks a drag/click from moving a piece.
  test('the board is disabled — nothing to play here, only to look through', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    const { container } = renderReviewPage();

    await screen.findByText(/daniel/);
    expect(container.querySelector('.coach-board-frame--pending')).toBeInTheDocument();
  });

  test('the back button navigates to the Games list', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByRole('button', { name: /back to games/i }));

    expect(await screen.findByText('games-page-marker')).toBeInTheDocument();
  });

  test('shows a move-quality icon for a classified move', async () => {
    mockMatchMedia(false);
    vi.stubGlobal(
      'fetch',
      mockFetch({
        classifiedMoves: [
          {
            ply: 3,
            moveSan: 'Nf3',
            mover: 'white',
            isUserMove: true,
            cpLoss: 0,
            quality: 'blunder',
            bestLineSan: ['Nc3'],
            evalAfterCp: -400,
            hangsPiece: true
          }
        ]
      })
    );
    renderReviewPage();

    expect(await screen.findByRole('button', { name: '??Nf3' })).toHaveClass('move-quality-blunder');
  });

  // A vs_bot game's route always returns liveMoveQualities (its in-progress
  // shape) alongside classifiedMoves: null — but once analysis finishes, the
  // richer, tactic-annotated moves live on gameReport.moves instead. Without
  // preferring it, a finished bot game's Review page would show only bare
  // quality badges and none of this PR's own notes/alternatives features.
  test('prefers the richer gameReport.moves over liveMoveQualities once analysis is ready', async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    const richMove: ClassifiedMoveDto = {
      ply: 3,
      moveSan: 'Nf3',
      mover: 'white',
      isUserMove: false,
      cpLoss: 0,
      quality: 'mistake',
      bestLineSan: ['Nc3'],
      evalAfterCp: -400,
      hangsPiece: false,
      reasons: ['Leaves the knight on d4 undefended']
    };
    vi.stubGlobal(
      'fetch',
      mockFetch({
        liveMoveQualities: [
          { ply: 3, moveSan: 'Nf3', mover: 'white', quality: 'mistake', cpLoss: 0, bestLineSan: ['Nc3'], evalAfterCp: -400 }
        ],
        gameReport: buildGameReport([richMove])
      })
    );
    renderReviewPage();

    await user.click(await screen.findByText('Nf3'));
    expect(await screen.findByText('Leaves the knight on d4 undefended')).toBeInTheDocument();
  });

  test('"Continue with Coach" is hidden once a game is already at the coach tier', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch({ reviewTier: 'coach' }));
    renderReviewPage();

    await screen.findByText(/daniel/);
    expect(screen.queryByRole('button', { name: /continue with coach/i })).not.toBeInTheDocument();
  });

  // A game reached by bookmark/direct navigation before its analysis
  // finishes would otherwise show a button that just 400s (promoteGame
  // requires a ready analysis) — gate on analysisStatus, same as GameRow's
  // own promotion/action gating on the Games list.
  test('"Continue with Coach" is hidden while the game\'s analysis isn\'t ready yet', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch({ analysisStatus: 'queued' }));
    renderReviewPage();

    await screen.findByText(/daniel/);
    expect(screen.queryByRole('button', { name: /continue with coach/i })).not.toBeInTheDocument();
  });

  test('"Continue with Coach" promotes the game, then starts and opens a coaching session', async () => {
    mockMatchMedia(false);
    const fetchMock = mockFetch();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByRole('button', { name: 'Continue with Coach' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/games/game-1/promote',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ tier: 'coach' }) })
      )
    );
    expect(await screen.findByText('session-page-marker')).toBeInTheDocument();
  });

  // A promote failure must not become an unhandled promise rejection — the
  // mutation swallows it into isError, surfaced as this inline message.
  test('shows an inline error, with no unhandled rejection, when starting a coaching session fails', async () => {
    mockMatchMedia(false);
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/games/game-1') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'game-1',
              pgn: PGN,
              userColor: 'white',
              whiteName: 'daniel',
              blackName: 'Marta',
              result: '1-0',
              classifiedMoves: null,
              reviewTier: 'imported',
              analysisStatus: 'ready',
              gameReport: null
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      if (path === '/api/games/game-1/promote' && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ title: 'nope' }), { status: 400 }));
      }
      throw new Error(`unexpected fetch: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByRole('button', { name: 'Continue with Coach' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not start a coaching session/i);
  });

  // chess.com reference (Daniel): the note for the current move is a
  // dominant card above the board, not something behind a tab or scrolled
  // past — see MoveNoteCard/GameReviewPage's own doc comments.
  test('on mobile, the note card is visible immediately — no tab or scroll needed to reach it', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    renderReviewPage();

    await screen.findByText(/daniel/);
    expect(screen.getByText(/select a move to see the coach's note/i)).toBeInTheDocument();
  });

  test('on mobile, selecting a move in the strip updates the note card', async () => {
    mockMatchMedia(false);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();
    await screen.findByText(/daniel/);

    await user.click(screen.getByText('e5'));

    expect(await screen.findByText('1… e5')).toBeInTheDocument();
  });

  // Anchored pre-move (useSessionBoardState's own show_position preMove
  // device, reused here): the board shows the position BEFORE the clicked
  // move, not after — that's the position an arrow for "what should have
  // been played instead" is actually legal from. "reveal" swaps to the
  // real post-move position.
  test('clicking a move in the move list anchors the board to the position before it, not after', async () => {
    mockMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();

    await user.click(await screen.findByText('e5'));

    await waitFor(() => {
      const latest = capturedOptions[capturedOptions.length - 1];
      expect(latest?.position).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    });
  });

  test('"reveal" shows the actual position after the clicked move', async () => {
    mockMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();

    await user.click(await screen.findByText('e5'));
    await user.click(await screen.findByRole('button', { name: /reveal/i }));

    await waitFor(() => {
      const latest = capturedOptions[capturedOptions.length - 1];
      expect(latest?.position).toContain('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR');
    });
  });

  test('picking a different move re-anchors pre-move instead of staying revealed', async () => {
    mockMatchMedia(true);
    vi.stubGlobal('fetch', mockFetch());
    const user = userEvent.setup();
    renderReviewPage();

    await user.click(await screen.findByText('e5'));
    await user.click(await screen.findByRole('button', { name: /reveal/i }));
    await user.click(await screen.findByText('Nf3'));

    expect(screen.getByRole('button', { name: /reveal/i })).toBeInTheDocument();
  });
});
