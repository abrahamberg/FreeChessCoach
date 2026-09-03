import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PracticeCard } from './PracticeCard.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function assignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'a1',
    userId: 'u1',
    diagnosisCode: 'TA-07',
    reason: 'You missed several knight forks in your last few games.',
    items: [
      { puzzleId: 'p1', fen: 'startpos', moves: ['e2e4'], rating: 1500, themes: ['fork'], result: 'pending' },
      { puzzleId: 'p2', fen: 'startpos', moves: ['e2e4'], rating: 1500, themes: ['fork'], result: 'solved' }
    ],
    status: 'in_progress',
    createdAt: '2026-08-01T00:00:00.000Z',
    startedAt: '2026-08-01T00:00:00.000Z',
    completedAt: null,
    ...overrides
  };
}

function renderCard(assignments: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(assignments))
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<PracticeCard />} />
          <Route path="/practice/:assignmentId" element={<div>practice-page-marker</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('PracticeCard (Task 59.6)', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('renders nothing when there are no open assignments', async () => {
    const { container } = renderCard([]);

    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  test('lists each assignment\'s reason and progress', async () => {
    renderCard([assignment()]);

    expect(await screen.findByText('You missed several knight forks in your last few games.')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 puzzles')).toBeInTheDocument();
  });

  test('shows "Continue" for an in_progress assignment and "Start" for a pending one', async () => {
    renderCard([assignment({ id: 'a1', status: 'in_progress' }), assignment({ id: 'a2', status: 'pending', reason: 'Pawn forks.' })]);

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  test('clicking the action navigates to the practice route for that assignment', async () => {
    const user = userEvent.setup();
    renderCard([assignment()]);

    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('practice-page-marker')).toBeInTheDocument();
  });
});
