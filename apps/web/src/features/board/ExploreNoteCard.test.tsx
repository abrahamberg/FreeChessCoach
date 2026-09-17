import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { ExploreNoteCard } from './ExploreNoteCard.js';

function classifiedMove(overrides: Partial<ClassifiedMoveDto>): ClassifiedMoveDto {
  return {
    ply: 1,
    moveSan: 'Qh5',
    mover: 'white',
    isUserMove: true,
    cpLoss: 250,
    quality: 'blunder',
    bestLineSan: ['Nf3'],
    evalAfterCp: -200,
    hangsPiece: false,
    ...overrides
  };
}

describe('ExploreNoteCard', () => {
  test('shows a prompt (still a real card, for the mobile "coach box" swap) until a sandbox move has been classified', () => {
    render(<ExploreNoteCard status="idle" evaluation={null} note={undefined} />);
    expect(screen.getByText(/play a move and I'll flag it here/i)).toBeInTheDocument();
    expect(document.querySelector('.explore-note-card--empty')).toBeInTheDocument();
  });

  test('shows an error prompt if the engine pipeline request fails, before any move has been classified', () => {
    render(<ExploreNoteCard status="error" evaluation={null} note={undefined} />);
    expect(screen.getByText(/couldn't reach the engine/i)).toBeInTheDocument();
  });

  test('shows the move, its quality badge, and note text once classified', () => {
    render(
      <ExploreNoteCard
        status="ready"
        evaluation="Black is much better"
        note={classifiedMove({ reasons: ['Hangs the queen to a simple fork.'] })}
      />
    );

    expect(screen.getByText('Qh5')).toBeInTheDocument();
    expect(screen.getByText('Hangs the queen to a simple fork.')).toBeInTheDocument();
    expect(screen.getByText('Black is much better')).toBeInTheDocument();
    expect(document.querySelector('.explore-note-card--blunder')).toBeInTheDocument();
  });

  test('shows an "updating…" indicator while a newer position is still loading, without hiding the stale note', () => {
    render(<ExploreNoteCard status="loading" evaluation={null} note={classifiedMove({})} />);

    expect(screen.getByText('updating…')).toBeInTheDocument();
    expect(screen.getByText('Qh5')).toBeInTheDocument();
  });

  test('falls back to "nothing to flag" for a quality with no reasons and no better line', () => {
    render(
      <ExploreNoteCard
        status="ready"
        evaluation={null}
        note={classifiedMove({ quality: 'good', cpLoss: 5, bestLineSan: [], reasons: [] })}
      />
    );

    expect(screen.getByText(/nothing to flag/i)).toBeInTheDocument();
  });
});
