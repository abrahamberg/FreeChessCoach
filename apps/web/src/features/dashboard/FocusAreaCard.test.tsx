import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { FocusAreaCard } from './FocusAreaCard.js';

describe('FocusAreaCard', () => {
  test('shows the resolved diagnosis label, the coach note, evidence count, and an "Improving" trend badge', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'king_safety',
          diagnosisCode: 'MS-01',
          label: 'Opponent-check scan omission',
          status: 'improving',
          note: 'Delays castling under pressure.',
          evidenceCount: 3,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );

    expect(screen.getByText('Opponent-check scan omission')).toBeInTheDocument();
    expect(screen.getByText(/delays castling under pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  test('falls back to the category label for a legacy row with no diagnosisCode', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'king_safety',
          diagnosisCode: null,
          label: 'King safety',
          status: 'active',
          note: 'Delays castling under pressure.',
          evidenceCount: 3,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );

    expect(screen.getByText('King safety')).toBeInTheDocument();
  });

  test('shows a "Needs attention" trend badge for an active (non-improving) area', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'passive_play',
          diagnosisCode: 'CA-01',
          label: 'Single-candidate search',
          status: 'active',
          note: 'Avoids active plans.',
          evidenceCount: 1,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });

  test('shows a "Resolved" trend badge for a resolved area', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'passive_play',
          diagnosisCode: 'CA-01',
          label: 'Single-candidate search',
          status: 'resolved',
          note: 'Fixed it.',
          evidenceCount: 4,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });

  test('"View evidence" calls onViewEvidence with the diagnosisCode and the resolved label', async () => {
    const user = userEvent.setup();
    const onViewEvidence = vi.fn();
    render(
      <FocusAreaCard
        area={{
          category: 'king_safety',
          diagnosisCode: 'MS-01',
          label: 'Opponent-check scan omission',
          status: 'active',
          note: 'Delays castling under pressure.',
          evidenceCount: 3,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
        onViewEvidence={onViewEvidence}
      />
    );

    await user.click(screen.getByRole('button', { name: /view evidence/i }));

    expect(onViewEvidence).toHaveBeenCalledWith('MS-01', 'Opponent-check scan omission');
  });

  test('with no diagnosisCode (a legacy row), "View evidence" is not rendered', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'king_safety',
          diagnosisCode: null,
          label: 'King safety',
          status: 'active',
          note: 'Delays castling under pressure.',
          evidenceCount: 3,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
        onViewEvidence={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /view evidence/i })).not.toBeInTheDocument();
  });
});
