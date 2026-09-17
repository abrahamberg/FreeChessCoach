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
  botId: null,
  reviewTier: 'imported' as const
};

function renderRow(overrides: Partial<Parameters<typeof GameRow>[0]['game']> = {}, handlers: Partial<Parameters<typeof GameRow>[0]> = {}) {
  return render(
    <GameRow
      game={{ ...BASE_GAME, ...overrides } as Parameters<typeof GameRow>[0]['game']}
      onSelect={vi.fn()}
      onReview={vi.fn()}
      onCoach={vi.fn()}
      onAnalyze={vi.fn()}
      onExportPgn={vi.fn()}
      onCopyPgn={vi.fn()}
      onDelete={vi.fn()}
      {...handlers}
    />
  );
}

async function openOverflowMenu(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  return user;
}

describe('GameRow (one consistent card, Daniel\'s IA feedback)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows both players with the user\'s side bold, and a win dot (not raw score)', () => {
    renderRow({ analysisStatus: 'ready' });

    expect(screen.getByText('daniel')).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByTitle('win')).toBeInTheDocument();
  });

  test('shows the source group as metadata alongside the date', () => {
    renderRow({ analysisStatus: 'ready', source: 'paste' });
    expect(screen.getByText('Imported')).toBeInTheDocument();
  });

  test('shows an "Analyzing…" status while queued, with no action button', () => {
    renderRow({ analysisStatus: 'queued' });
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review|coach|continue/i })).not.toBeInTheDocument();
  });

  // The core of the redesign: a ready game always offers both actions
  // together, regardless of source or how many times it's been visited —
  // there is no tier to "use up" by reviewing or coaching a game.
  test('a ready game shows a "Ready" status with both Review and Coach actions', async () => {
    const onReview = vi.fn();
    const onCoach = vi.fn();
    const user = userEvent.setup();
    renderRow({ analysisStatus: 'ready' }, { onReview, onCoach });

    expect(screen.getByText('Ready')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(onReview).toHaveBeenCalledWith('g1');
    await user.click(screen.getByRole('button', { name: 'Coach' }));
    expect(onCoach).toHaveBeenCalledWith('g1');
  });

  // Already at the coach tier is no different from any other ready game —
  // Review is still offered alongside Coach, not replaced by it.
  test('a ready game already at the coach tier still offers Review alongside Coach', () => {
    renderRow({ analysisStatus: 'ready', reviewTier: 'coach' });

    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coach' })).toBeInTheDocument();
  });

  test('shows a "Failed" status when analysis failed, with no action button', () => {
    renderRow({ analysisStatus: 'failed' });
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review|coach|continue/i })).not.toBeInTheDocument();
  });

  // Distinct from the "Analyzing…" default: paused means waiting on the
  // user's own browser tunnel to reconnect, not active progress right now.
  test('shows a "Paused" status, not "Analyzing…", when waiting on the browser tunnel to reconnect', () => {
    renderRow({ analysisStatus: 'paused' });
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.queryByText('Analyzing…')).not.toBeInTheDocument();
  });

  // architecture §14: a coach_play game never gets an `analyses` row, so it
  // must not fall into the analyze-mode "analyzing…" default forever.
  test('shows an "In progress" status and "Continue" action for an unfinished play-mode game', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderRow({ source: 'coach_play', analysisStatus: null, sessionId: 'session-1', reviewTier: 'coach' }, { onSelect });

    expect(screen.getByText('In progress')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSelect).toHaveBeenCalledWith('g1');
  });

  test('shows a "Completed" status for a play-mode game with no resumable session', () => {
    renderRow({ source: 'coach_play', analysisStatus: null, sessionId: null, reviewTier: 'coach' });
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  // docs/plan.md Phase 62: unlike coach_play, a finished vs_bot game DOES
  // get the standard-depth post-game analysis job (bot-finalize.ts), so a
  // completed row's action reflects that analysis's status instead of a
  // bare "Completed" badge.
  test('vs_bot: shows "In progress"/"Continue" while a session is still active', () => {
    renderRow({ source: 'vs_bot', analysisStatus: null, sessionId: 'session-1', reviewTier: 'bot' });
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  test('vs_bot: completed with analysis already ready offers both Review and Coach', () => {
    renderRow({ source: 'vs_bot', analysisStatus: 'ready', sessionId: null, reviewTier: 'bot' });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Coach' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get coach analysis|continue/i })).not.toBeInTheDocument();
  });

  test('vs_bot: completed with no analysis queued yet falls back to "Get coach analysis"', async () => {
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    renderRow({ source: 'vs_bot', analysisStatus: null, sessionId: null, reviewTier: 'bot' }, { onAnalyze });

    expect(screen.getByText('Completed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));
    expect(onAnalyze).toHaveBeenCalledWith('g1');
  });

  test('vs_bot: completed while analysis is still running shows "Analyzing…"', () => {
    renderRow({ source: 'vs_bot', analysisStatus: 'engine_running', sessionId: null, reviewTier: 'bot' });
    expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
  });

  test('Download PGN in the overflow menu calls onExportPgn with the game id', async () => {
    const onExportPgn = vi.fn();
    renderRow({ analysisStatus: 'ready' }, { onExportPgn });
    const user = await openOverflowMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Download PGN' }));

    expect(onExportPgn).toHaveBeenCalledWith('g1');
  });

  test('Copy PGN in the overflow menu calls onCopyPgn with the game id', async () => {
    const onCopyPgn = vi.fn();
    renderRow({ analysisStatus: 'ready' }, { onCopyPgn });
    const user = await openOverflowMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Copy PGN' }));

    expect(onCopyPgn).toHaveBeenCalledWith('g1');
  });

  // Phase 31 stat-bank import: a game imported with deferAnalysis has no
  // `analyses` row at all, distinct from every in-progress analysisStatus.
  test('shows a "Not analyzed" status and "Get coach analysis" action for a deferred-analysis import', () => {
    renderRow({ analysisStatus: null });
    expect(screen.getByText('Not analyzed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get coach analysis' })).toBeInTheDocument();
  });

  test('clicking "Get coach analysis" calls onAnalyze, not onSelect', async () => {
    const onSelect = vi.fn();
    const onAnalyze = vi.fn();
    const user = userEvent.setup();
    renderRow({ analysisStatus: null }, { onSelect, onAnalyze });

    await user.click(screen.getByRole('button', { name: 'Get coach analysis' }));

    expect(onAnalyze).toHaveBeenCalledWith('g1');
    expect(onSelect).not.toHaveBeenCalled();
  });

  test('the overflow menu no longer offers to promote a game — every ready game already shows Review and Coach', async () => {
    renderRow({ analysisStatus: 'ready' });
    await openOverflowMenu();
    expect(screen.queryByRole('menuitem', { name: /move to/i })).not.toBeInTheDocument();
  });

  test('delete lives in the overflow menu for every row, failed or not', async () => {
    renderRow({ analysisStatus: 'failed' });
    const user = await openOverflowMenu();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
  });

  test('choosing Delete opens a confirmation dialog naming the game, and confirming calls onDelete', async () => {
    const onReview = vi.fn();
    const onDelete = vi.fn();
    const user = await (async () => {
      renderRow({ analysisStatus: 'ready' }, { onReview, onDelete });
      return openOverflowMenu();
    })();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/daniel vs\. marta/i);

    await user.click(screen.getByRole('button', { name: 'Delete game' }));

    expect(onDelete).toHaveBeenCalledWith('g1');
    expect(onReview).not.toHaveBeenCalled();
  });

  test('canceling the confirmation dialog does not delete the game', async () => {
    const onDelete = vi.fn();
    renderRow({ analysisStatus: 'ready' }, { onDelete });
    const user = await openOverflowMenu();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
