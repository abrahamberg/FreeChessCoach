import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ClassifiedMoveDto, PositionAnalysis } from '@freechesscoach/shared';
import { MoveExplorer } from './MoveExplorer.js';

const SAN_MOVES = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'];

const ANALYSIS_FIXTURE: PositionAnalysis = {
  fen: 'fen-after-e4',
  depth: 16,
  multiPv: 1,
  bestMove: 'e5',
  eval: { cp: 20, mateIn: null },
  lines: [],
  features: {
    turn: 'black',
    boardState: 'none',
    availableMoves: ['e5'],
    mobility: { white: 20, black: 20 },
    controlledSquares: [],
    piecesUnderAttack: [],
    hangingPieces: [],
    underDefendedPieces: [],
    overloadedDefenders: [],
    centerControlScore: { white: 0, black: 0 },
    openFiles: [],
    semiOpenFiles: [],
    doubledPawns: [],
    isolatedPawns: [],
    passedPawns: [],
    targetsAttacked: [],
    forks: [],
    captureOpportunities: []
  }
};

function classifiedMove(overrides: Partial<ClassifiedMoveDto>): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'e4',
    mover: 'white',
    isUserMove: true,
    cpLoss: 0,
    quality: 'good',
    bestLineSan: ['e4'],
    evalAfterCp: 20,
    hangsPiece: false,
    ...overrides
  };
}

describe('MoveExplorer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('right-clicking a move opens the analysis inspector with its saved analysis', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(ANALYSIS_FIXTURE), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const positions = [
      { ply: 0, fen: 'start-fen' },
      { ply: 1, fen: 'fen-after-e4' }
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={positions} currentPly={0} onSelect={vi.fn()} />
      </QueryClientProvider>
    );

    fireEvent.contextMenu(screen.getByRole('button', { name: 'e4' }));

    expect(await screen.findByRole('dialog', { name: /1\. e4/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/positions/analyze',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen: 'fen-after-e4' }) })
    );
  });

  test('right-clicking a move with no known fen does not open the inspector', () => {
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    fireEvent.contextMenu(screen.getByRole('button', { name: 'e4' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('renders paired move numbers with White and Black SAN', () => {
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('e5')).toBeInTheDocument();
    expect(screen.getByText('4.')).toBeInTheDocument();
    expect(screen.getByText('Qxf7#')).toBeInTheDocument();
  });

  test('marks the current ply', () => {
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} currentPly={3} onSelect={vi.fn()} />);

    expect(screen.getByText('Qh5')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('e5')).not.toHaveAttribute('aria-current');
  });

  test('clicking a move calls onSelect with its ply', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} currentPly={0} onSelect={onSelect} />);

    await user.click(screen.getByText('Nc6'));
    expect(onSelect).toHaveBeenCalledWith(4);
  });

  test('renders a NAG symbol for a non-good move, but none for a good move', () => {
    const classifiedMoves = [
      classifiedMove({ ply: 3, moveSan: 'Qh5', quality: 'inaccuracy' }),
      classifiedMove({ ply: 1, moveSan: 'e4', quality: 'good' })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '?!Qh5' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument();
  });

  test('applies a quality-specific class per move for color coding', () => {
    const classifiedMoves = [
      classifiedMove({ ply: 7, moveSan: 'Qxf7#', quality: 'blunder' }),
      classifiedMove({ ply: 3, moveSan: 'Qh5', quality: 'brilliant' })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '??Qxf7#' })).toHaveClass('move-quality-blunder');
    expect(screen.getByRole('button', { name: '!!Qh5' })).toHaveClass('move-quality-brilliant');
  });

  test('nav pills step to first/prev/next/last move', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={[]} positions={[]} currentPly={3} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(2);

    await user.click(screen.getByRole('button', { name: /next move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(4);

    await user.click(screen.getByRole('button', { name: /first move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(0);

    await user.click(screen.getByRole('button', { name: /last move/i }));
    expect(onSelect).toHaveBeenLastCalledWith(7);
  });

  test('the notes panel shows a plain-language note for the current non-good move, open by default', () => {
    const classifiedMoves = [classifiedMove({ ply: 3, moveSan: 'Qh5', quality: 'inaccuracy', bestLineSan: ['Nf3'] })];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={3} onSelect={vi.fn()} />);

    expect(screen.getByText(/better was nf3/i)).toBeInTheDocument();
  });

  test('renders a star badge for a best move', () => {
    const classifiedMoves = [classifiedMove({ ply: 1, moveSan: 'e4', quality: 'best' })];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '★e4' })).toHaveClass('move-quality-best');
  });

  test('renders an X badge for a miss', () => {
    const classifiedMoves = [classifiedMove({ ply: 3, moveSan: 'Qh5', quality: 'miss' })];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '✕Qh5' })).toHaveClass('move-quality-miss');
  });

  test('renders a tactic-opportunity marker on a ply that found one, and none on a plain move', () => {
    const classifiedMoves = [
      classifiedMove({ ply: 1, moveSan: 'e4', quality: 'good' }),
      classifiedMove({
        ply: 3,
        moveSan: 'Qh5',
        mover: 'white',
        quality: 'best',
        tacticOpportunity: { type: 'fork', found: true }
      })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'e4' })).not.toHaveTextContent('⚡');
    expect(screen.getByTitle('Forks: found')).toBeInTheDocument();
  });

  test('renders a distinct marker for a missed opportunity vs. an unprevented opponent tactic', () => {
    const classifiedMoves = [
      classifiedMove({ ply: 1, moveSan: 'e4', mover: 'white', tacticOpportunity: { type: 'pin', found: false } }),
      classifiedMove({
        ply: 3,
        moveSan: 'Qh5',
        mover: 'white',
        tacticPrevention: { type: 'skewer', prevented: false }
      })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={0} onSelect={vi.fn()} />);

    expect(screen.getByTitle('Pins: available, not played')).toBeInTheDocument();
    expect(screen.getByTitle("Opponent's Skewers: not defused")).toBeInTheDocument();
  });

  test('the notes panel renders the backend-supplied reasons list when present', () => {
    const classifiedMoves = [
      classifiedMove({
        ply: 3,
        moveSan: 'Qh5',
        quality: 'mistake',
        bestLineSan: ['Nf3'],
        reasons: ['Leaves the knight on d4 undefended', 'Costs 9 squares of piece mobility']
      })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={3} onSelect={vi.fn()} />);

    expect(screen.getByText('Leaves the knight on d4 undefended')).toBeInTheDocument();
    expect(screen.getByText('Costs 9 squares of piece mobility')).toBeInTheDocument();
    expect(screen.queryByText(/better was/i)).not.toBeInTheDocument();
  });

  test('the notes panel does not show a "better was" note for a best move (nothing to improve on)', () => {
    const classifiedMoves = [classifiedMove({ ply: 1, moveSan: 'e4', quality: 'best', bestLineSan: ['e4'] })];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={1} onSelect={vi.fn()} />);

    expect(screen.queryByText(/better was/i)).not.toBeInTheDocument();
  });

  test('a book move shows its opening name/ECO unconditionally, without toggling notes (§11)', () => {
    const classifiedMoves = [
      classifiedMove({
        ply: 1,
        moveSan: 'e4',
        quality: 'book',
        reasons: ['Theory — Italian Game (C50)']
      })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={1} onSelect={vi.fn()} />);

    expect(screen.getByText('Theory — Italian Game (C50)')).toBeInTheDocument();
  });

  test('a non-book move never shows an opening label', () => {
    const classifiedMoves = [classifiedMove({ ply: 1, moveSan: 'e4', quality: 'good' })];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={1} onSelect={vi.fn()} />);

    expect(screen.queryByText(/theory/i)).not.toBeInTheDocument();
  });

  test('the alternatives panel shows the best PV and win%-ranked runners-up, not raw cp', () => {
    const classifiedMoves = [
      classifiedMove({
        ply: 3,
        moveSan: 'Qh5',
        quality: 'mistake',
        bestMoveSan: 'Nf3',
        bestLinePvSan: ['Nf3', 'Nc6', 'Bb5'],
        alternatives: [
          { san: 'Bc4', cp: 40, winPct: 58.2 },
          { san: 'Nc3', cp: 15, winPct: 52.9 }
        ]
      })
    ];
    render(<MoveExplorer sanMoves={SAN_MOVES} classifiedMoves={classifiedMoves} positions={[]} currentPly={3} onSelect={vi.fn()} />);

    expect(screen.getByText('Best: Nf3 Nc6 Bb5')).toBeInTheDocument();
    expect(screen.getByText('Bc4 (58.2%)')).toBeInTheDocument();
    expect(screen.getByText('Nc3 (52.9%)')).toBeInTheDocument();
    expect(screen.queryByText(/40/)).not.toBeInTheDocument();
  });
});
