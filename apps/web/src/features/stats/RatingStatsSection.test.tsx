import type { RatingStats } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { RatingStatsSection } from './RatingStatsSection.js';

describe('RatingStatsSection', () => {
  test('renders the games-with-estimate headline and a line connecting every game in date order', () => {
    const stats: RatingStats = {
      gamesWithEstimate: 3,
      points: [
        { playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1250 },
        { playedAt: '2026-08-05T00:00:00.000Z', estimatedRating: 1580 },
        { playedAt: '2026-08-12T00:00:00.000Z', estimatedRating: 1650 }
      ]
    };

    render(<RatingStatsSection stats={stats} />);

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /estimated rating across 3 games, from 1250 to 1650/i })).toBeInTheDocument();
    expect(document.querySelectorAll('.rating-chart__point')).toHaveLength(3);
    expect(document.querySelector('.rating-chart__line')).not.toBeNull();
    expect(screen.getByText('Aug 1')).toBeInTheDocument();
    expect(screen.getByText('Aug 12')).toBeInTheDocument();
  });

  test('renders a single point with no connecting line when there is only one game', () => {
    const stats: RatingStats = { gamesWithEstimate: 1, points: [{ playedAt: '2026-08-01T00:00:00.000Z', estimatedRating: 1500 }] };

    render(<RatingStatsSection stats={stats} />);

    expect(document.querySelectorAll('.rating-chart__point')).toHaveLength(1);
    expect(document.querySelector('.rating-chart__line')).toBeNull();
  });

  test('shows an empty-state message with no points', () => {
    render(<RatingStatsSection stats={{ gamesWithEstimate: 0, points: [] }} />);

    expect(screen.getByText(/not enough analyzed games/i)).toBeInTheDocument();
  });
});
