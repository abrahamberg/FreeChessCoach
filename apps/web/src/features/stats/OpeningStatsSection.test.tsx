import type { OpeningStats } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { OpeningStatsSection } from './OpeningStatsSection.js';

describe('OpeningStatsSection', () => {
  test('renders the headline stats and a performance-by-opening row', () => {
    const stats: OpeningStats = {
      averageBookMoves: 6.5,
      openingAccuracy: 88.2,
      averageOpeningMistakes: 0.5,
      performanceByOpening: [{ opening: 'Italian Game', gamesPlayed: 4, winPct: 75, accuracy: 82.3 }]
    };

    render(<OpeningStatsSection stats={stats} />);

    expect(screen.getByText('88.2%')).toBeInTheDocument();
    expect(screen.getByText('6.5')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Italian Game' })).toBeInTheDocument();
  });

  test('shows null stats as "—" and an empty-table message with no performance rows', () => {
    const stats: OpeningStats = {
      averageBookMoves: null,
      openingAccuracy: null,
      averageOpeningMistakes: null,
      performanceByOpening: []
    };

    render(<OpeningStatsSection stats={stats} />);

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getByText(/no opening data yet/i)).toBeInTheDocument();
  });

  test('caps the table at 5 openings with a "Show all" toggle beyond that', async () => {
    const user = userEvent.setup();
    const stats: OpeningStats = {
      averageBookMoves: 6.5,
      openingAccuracy: 88.2,
      averageOpeningMistakes: 0.5,
      performanceByOpening: Array.from({ length: 7 }, (_, i) => ({
        opening: `Opening ${i}`,
        gamesPlayed: 7 - i,
        winPct: 50,
        accuracy: 80
      }))
    };

    render(<OpeningStatsSection stats={stats} />);

    expect(screen.getAllByRole('row')).toHaveLength(1 + 5); // header + 5 visible rows

    await user.click(screen.getByRole('button', { name: 'Show all 7' }));

    expect(screen.getAllByRole('row')).toHaveLength(1 + 7);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });
});
