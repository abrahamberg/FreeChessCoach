import { TACTIC_MOTIF_TYPES, type TacticMotifCounts } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { TacticsStatsSection } from './TacticsStatsSection.js';

function zeroMotifs(): TacticMotifCounts {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as TacticMotifCounts;
}

describe('TacticsStatsSection', () => {
  test('renders a found/opportunities pair for each motif with opportunities, sorted descending', () => {
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2 }, pin: { opportunities: 3, found: 3 } };

    render(<TacticsStatsSection motifs={motifs} />);

    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('2/5')).toBeInTheDocument();
    expect(screen.getByText('Pins')).toBeInTheDocument();
    expect(screen.getByText('3/3')).toBeInTheDocument();
  });

  test('omits motifs with zero opportunities', () => {
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2 } };

    render(<TacticsStatsSection motifs={motifs} />);

    expect(screen.queryByText('Pins')).not.toBeInTheDocument();
  });

  test('shows an empty-state message when no motifs have any opportunities', () => {
    render(<TacticsStatsSection motifs={zeroMotifs()} />);
    expect(screen.getByText(/no tactical opportunities recorded yet/i)).toBeInTheDocument();
  });
});
