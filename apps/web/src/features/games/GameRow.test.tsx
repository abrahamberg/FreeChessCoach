import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GameRow } from './GameRow.js';

const BASE_GAME = {
  id: 'g1',
  source: 'paste' as const,
  userColor: 'white' as const,
  whiteName: 'daniel',
  blackName: 'Marta',
  result: '1-0',
  timeControl: '10+0',
  playedAt: '2026-07-20T10:00:00.000Z',
  createdAt: '2026-07-20T10:05:00.000Z',
  sessionId: null,
  botId: null
};

async function openOverflowMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  return user;
}

describe('GameRow (design-improvements.md §3.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows both players with the user\'s side bold, and a win dot (not raw score)', () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('daniel')).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByTitle('win')).toBeInTheDocument();
  });

  test('shows an "Analyzing…" status while queued, with no action button', () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'queued' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session|continue/i })).not.toBeInTheDocument();
  });

  test('shows a separate "Ready" status badge and "Start session" action when analysis is ready', () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start session' })).toBeInTheDocument();
  });

  // Plain "Failed" status, no action button: clicking has nothing to do
  // (handleSelect gates on analysisStatus === 'ready'), so no action label
  // promising something that doesn't exist.
  test('shows a "Failed" status when analysis failed, with no action button', () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'failed' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start session|continue/i })).not.toBeInTheDocument();
  });

  // architecture §14: a coach_play game never gets an `analyses` row, so it
  // must not fall into the analyze-mode "analyzing…" default forever.
  test('shows an "In progress" status and "Continue" action for an unfinished play-mode game', () => {
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'coach_play', analysisStatus: null, sessionId: 'session-1' }}
        onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  test('shows a "Completed" status for a play-mode game with no resumable session', () => {
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'coach_play', analysisStatus: null, sessionId: null }}
        onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  // docs/plan.md Phase 62: unlike coach_play, a finished vs_bot game DOES
  // get the standard-depth post-game analysis job (bot-finalize.ts), so a
  // completed row's action reflects that analysis's status instead of a
  // bare "Completed" badge.
  test('vs_bot: shows "In progress"/"Continue" while a session is still active', () => {
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'vs_bot', analysisStatus: null, sessionId: 'session-1' }}
        onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  test('vs_bot: completed with analysis already ready shows a bare "Completed" badge, no action', () => {
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'vs_bot', analysisStatus: 'ready', sessionId: null }}
        onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get coach analysis|continue/i })).not.toBeInTheDocument();
  });

  test('vs_bot: completed with no analysis queued yet falls back to "Get coach analysis"', async () => {
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'vs_bot', analysisStatus: null, sessionId: null }}
        onSelect={vi.fn()} onAnalyze={onAnalyze} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));
    expect(onAnalyze).toHaveBeenCalledWith('g1');
  });

  test('vs_bot: completed while analysis is still running shows "Analyzing…"', () => {
    render(
      <GameRow
        game={{ ...BASE_GAME, source: 'vs_bot', analysisStatus: 'engine_running', sessionId: null }}
        onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  test('Export PGN in the overflow menu calls onExportPgn with the game id', async () => {
    const onExportPgn = vi.fn();
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={onExportPgn} onDelete={vi.fn()} />);
    const user = await openOverflowMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Export PGN' }));

    expect(onExportPgn).toHaveBeenCalledWith('g1');
  });

  // Phase 31 stat-bank import: a game imported with deferAnalysis has no
  // `analyses` row at all, distinct from every in-progress analysisStatus.
  test('shows a "Not analyzed" status and "Get coach analysis" action for a deferred-analysis import', () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: null }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Not analyzed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get coach analysis' })).toBeInTheDocument();
  });

  test('clicking "Get coach analysis" calls onAnalyze, not onSelect', async () => {
    const onSelect = vi.fn();
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: null }} onSelect={onSelect} onAnalyze={onAnalyze} onExportPgn={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));

    expect(onAnalyze).toHaveBeenCalledWith('g1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('clicking the action button calls onSelect with the game id', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={onSelect} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start session' }));
    expect(onSelect).toHaveBeenCalledWith('g1');
  });

  test('delete lives in the overflow menu for every row, failed or not', async () => {
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'failed' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={vi.fn()} />);
    const user = await openOverflowMenu();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  test('choosing Delete opens a confirmation dialog naming the game, and confirming calls onDelete', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const user = await (async () => {
      render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={onSelect} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={onDelete} />);
      return openOverflowMenu();
    })();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/daniel vs\. marta/i);

    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(onDelete).toHaveBeenCalledWith('g1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('canceling the confirmation dialog does not delete the game', async () => {
    const onDelete = vi.fn();
    render(<GameRow game={{ ...BASE_GAME, analysisStatus: 'ready' }} onSelect={vi.fn()} onAnalyze={vi.fn()} onExportPgn={vi.fn()} onDelete={onDelete} />);
    const user = await openOverflowMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
