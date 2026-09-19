import type { DiagnosisEntryResponse } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { DiagnosisCard } from './DiagnosisCard.js';

function entryFixture(overrides: Partial<DiagnosisEntryResponse> = {}): DiagnosisEntryResponse {
  return {
    code: 'TA-07',
    label: 'Knight-fork recognition',
    direction: 'D',
    opportunities: 9,
    episodes: 6,
    failureRate: 6 / 9,
    confidence: 'probable',
    spread: { games: 5, sessions: 3, openings: 3, sides: 2 },
    severityMix: { minor: 0, meaningful: 2, major: 4, decisive: 0 },
    scopeTags: ['general'],
    controlSkill: { code: 'TA-07', label: 'Knight-fork recognition', direction: 'O', failureRate: 0.1 },
    historyStatus: 'persistent',
    firedGates: [],
    ...overrides
  };
}

describe('DiagnosisCard', () => {
  test('shows the resolved label, E/O with percent, scope, and a confidence badge', () => {
    render(<DiagnosisCard entry={entryFixture()} onViewEvidence={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Knight-fork recognition' })).toBeInTheDocument();
    expect(screen.getByText(/6\/9 failed \(67%\)/)).toBeInTheDocument();
    expect(screen.getByText(/General/)).toBeInTheDocument();
    expect(screen.getByText('Probable')).toBeInTheDocument();
  });

  test('shows a caveat line when a data-quality gate fired, and none when it did not', () => {
    const { rerender } = render(
      <DiagnosisCard
        entry={entryFixture({ firedGates: [{ code: 'DQ-04', label: 'Missing or unreliable clock data.', evidence: '30/30 missing' }] })}
        onViewEvidence={vi.fn()}
      />
    );
    expect(screen.getByText(/Missing or unreliable clock data/)).toBeInTheDocument();

    rerender(<DiagnosisCard entry={entryFixture({ firedGates: [] })} onViewEvidence={vi.fn()} />);
    expect(screen.queryByText(/Caveat/)).not.toBeInTheDocument();
  });

  test('"View evidence" calls onViewEvidence with the code and label', async () => {
    const user = userEvent.setup();
    const onViewEvidence = vi.fn();
    render(<DiagnosisCard entry={entryFixture()} onViewEvidence={onViewEvidence} />);

    await user.click(screen.getByRole('button', { name: /view evidence/i }));

    expect(onViewEvidence).toHaveBeenCalledWith('TA-07', 'Knight-fork recognition');
  });
});
