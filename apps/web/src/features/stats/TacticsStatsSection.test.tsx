import { TACTIC_MOTIF_TYPES, type TacticMotifCounts } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { TacticsStatsSection } from './TacticsStatsSection.js';

function zeroMotifs(): TacticMotifCounts {
  return Object.fromEntries(TACTIC_MOTIF_TYPES.map((type) => [type, { opportunities: 0, found: 0 }])) as TacticMotifCounts;
}

describe('TacticsStatsSection', () => {
  test('renders a percent + found/opportunities pair for each motif, sorted descending', () => {
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2 }, pin: { opportunities: 3, found: 3 } };

    render(<TacticsStatsSection motifs={motifs} />);

    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('40% (2/5)')).toBeInTheDocument();
    expect(screen.getByText('Pins')).toBeInTheDocument();
    expect(screen.getByText('100% (3/3)')).toBeInTheDocument();
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

  test('caps the list at 5 motifs with a "Show all" toggle beyond that', async () => {
    const user = userEvent.setup();
    const motifs = { ...zeroMotifs() };
    for (const [index, type] of TACTIC_MOTIF_TYPES.entries()) {
      motifs[type] = { opportunities: TACTIC_MOTIF_TYPES.length - index, found: 1 };
    }

    render(<TacticsStatsSection motifs={motifs} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: `Show all ${TACTIC_MOTIF_TYPES.length}` }));

    expect(screen.getAllByRole('listitem')).toHaveLength(TACTIC_MOTIF_TYPES.length);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument();
  });

  test('switching to the Played tab shows raw played counts, not fractions', async () => {
    const user = userEvent.setup();
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2, played: 3 } };

    render(<TacticsStatsSection motifs={motifs} />);
    await user.click(screen.getByRole('tab', { name: 'Played' }));

    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('40% (2/5)')).not.toBeInTheDocument();
  });

  test('a motif with no recorded played count on the Played tab shows "—", not "0"', async () => {
    const user = userEvent.setup();
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2 } };

    render(<TacticsStatsSection motifs={motifs} />);
    await user.click(screen.getByRole('tab', { name: 'Played' }));

    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('the Prevented tab surfaces a motif never flagged as an opportunity, when it has a prevented count', async () => {
    const user = userEvent.setup();
    const motifs = { ...zeroMotifs(), pin: { opportunities: 0, found: 0, prevented: 1 } };

    render(<TacticsStatsSection motifs={motifs} />);
    expect(screen.queryByText('Pins')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Prevented' }));

    expect(screen.getByText('Pins')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('shows the Found tab by default', () => {
    const motifs = { ...zeroMotifs(), fork: { opportunities: 5, found: 2 } };
    render(<TacticsStatsSection motifs={motifs} />);
    expect(screen.getByRole('tab', { name: 'Found' })).toHaveAttribute('aria-selected', 'true');
  });
});
