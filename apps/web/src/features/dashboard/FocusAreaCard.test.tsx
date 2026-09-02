import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { FocusAreaCard } from './FocusAreaCard.js';

describe('FocusAreaCard', () => {
  test('shows the category in plain words, the coach note, evidence count, and an "Improving" trend badge', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'king_safety',
          diagnosisCode: 'MS-01',
          status: 'improving',
          note: 'Delays castling under pressure.',
          evidenceCount: 3,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );

    expect(screen.getByText(/king safety/i)).toBeInTheDocument();
    expect(screen.getByText(/delays castling under pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText('Improving')).toBeInTheDocument();
  });

  test('shows a "Needs attention" trend badge for an active (non-improving) area', () => {
    render(
      <FocusAreaCard
        area={{
          category: 'passive_play',
          diagnosisCode: 'CA-01',
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
          status: 'resolved',
          note: 'Fixed it.',
          evidenceCount: 4,
          lastSeenAt: '2026-07-20T10:00:00.000Z'
        }}
      />
    );
    expect(screen.getByText('Resolved')).toBeInTheDocument();
  });
});
