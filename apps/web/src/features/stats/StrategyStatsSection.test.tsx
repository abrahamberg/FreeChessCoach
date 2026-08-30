import type { StrategyStats } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { StrategyStatsSection } from './StrategyStatsSection.js';

describe('StrategyStatsSection', () => {
  test('renders the overall accuracy and every named sub-score', () => {
    const stats: StrategyStats = {
      overall: 78,
      pawnStructure: 80,
      spaceAdvantage: 78,
      activePiece: 85,
      attacking: 70,
      defending: 88
    };

    render(<StrategyStatsSection stats={stats} />);

    expect(screen.getAllByText('78.0%').length).toBeGreaterThan(0);
    expect(screen.getByText(/pawn structure accuracy/i)).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText(/defending accuracy/i)).toBeInTheDocument();
    expect(screen.getByText('88.0%')).toBeInTheDocument();
  });

  test('shows "—" for every null sub-score', () => {
    const stats: StrategyStats = {
      overall: null,
      pawnStructure: null,
      spaceAdvantage: null,
      activePiece: null,
      attacking: null,
      defending: null
    };

    render(<StrategyStatsSection stats={stats} />);

    expect(screen.getAllByText('—')).toHaveLength(6);
  });
});
