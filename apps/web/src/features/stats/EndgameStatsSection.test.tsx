import type { EndgameStats } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { EndgameStatsSection } from './EndgameStatsSection.js';

describe('EndgameStatsSection', () => {
  test('renders overall accuracy, standing rows, and theme rows', () => {
    const stats: EndgameStats = {
      overallAccuracy: 70,
      byStanding: [{ standing: 'winning', gamesPlayed: 3, winPct: 66.7 }],
      byTheme: [{ theme: 'kingAndPawn', gamesPlayed: 2, accuracy: 75 }]
    };

    render(<EndgameStatsSection stats={stats} />);

    expect(screen.getByText('70.0%')).toBeInTheDocument();
    expect(screen.getByText(/from winning positions \(3\)/i)).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText(/king & pawn \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
  });

  test('shows "no endgames reached yet" when both bucket lists are empty', () => {
    const stats: EndgameStats = { overallAccuracy: null, byStanding: [], byTheme: [] };

    render(<EndgameStatsSection stats={stats} />);

    expect(screen.getAllByText(/no endgames reached yet/i)).toHaveLength(2);
  });
});
