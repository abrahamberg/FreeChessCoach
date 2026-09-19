import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import type { ImportedGameItem } from '@freechesscoach/shared';
import { RecommendedGameCard } from './RecommendedGameCard.js';

const GAME: ImportedGameItem = {
  id: 'g1', source: 'lichess', userColor: 'white', whiteName: 'daniel', blackName: 'Marta', result: '0-1', timeControl: '600+0',
  playedAt: null, createdAt: '2026-07-20T10:00:00.000Z', analysisStatus: 'ready', sessionId: null, botId: null, reviewTier: 'imported', estimatedRating: null
};

const CANDIDATE = {
  gameId: 'g1',
  points: 6,
  topMotifs: [
    { motif: 'fork' as const, missed: 3, allowed: 1 },
    { motif: 'pin' as const, missed: 2, allowed: 0 }
  ]
};

function renderCard(handlers: { onStartCoaching?: () => void; onReview?: () => void } = {}) {
  return render(
    <MemoryRouter>
      <RecommendedGameCard game={GAME} candidate={CANDIDATE} onStartCoaching={handlers.onStartCoaching ?? vi.fn()} onReview={handlers.onReview ?? vi.fn()} />
    </MemoryRouter>
  );
}

describe('RecommendedGameCard', () => {
  test('names the game and why it was picked, in the reader\'s terms', () => {
    renderCard();

    expect(screen.getByText(/daniel vs\. marta/i)).toBeInTheDocument();
    expect(screen.getByText('Forks — missed 3, allowed 1')).toBeInTheDocument();
    expect(screen.getByText('Pins — missed 2')).toBeInTheDocument();
  });

  test('Start coaching session and Review it first call their handlers; Go to my games links to /games', async () => {
    const onStartCoaching = vi.fn();
    const onReview = vi.fn();
    const user = userEvent.setup();
    renderCard({ onStartCoaching, onReview });

    await user.click(screen.getByRole('button', { name: 'Start coaching session' }));
    await user.click(screen.getByRole('button', { name: 'Review it first' }));

    expect(onStartCoaching).toHaveBeenCalledOnce();
    expect(onReview).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Go to my games' })).toHaveAttribute('href', '/games');
  });
});
