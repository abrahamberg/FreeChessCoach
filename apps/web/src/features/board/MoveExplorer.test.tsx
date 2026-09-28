import { render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { MoveExplorer } from './MoveExplorer.js';
import { MoveStrip } from './MoveStrip.js';

describe('MoveExplorer', () => {
  test('a game starts at 1. with White', () => {
    render(<MoveExplorer sanMoves={['e4', 'e5', 'Nf3']} classifiedMoves={[]} positions={[]} currentPly={0} onSelect={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['1.e4e5', '2.Nf3']);
  });

  test('a course can start mid-game with Black to move, and fades its lead-in', () => {
    render(
      <MoveExplorer
        sanMoves={['Nc6', 'Bb5', 'a6']}
        classifiedMoves={[]}
        positions={[]}
        currentPly={3}
        onSelect={vi.fn()}
        start={{ moveNumber: 2, blackFirst: true }}
        dimmedThroughPly={1}
      />
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual(['2.…Nc6', '3.Bb5a6']);
    expect(within(rows[0]!).getByRole('button', { name: 'Nc6' }).className).toContain('move-explorer__move--dimmed');
    expect(within(rows[1]!).getByRole('button', { name: 'Bb5' }).className).not.toContain('dimmed');
  });
});

describe('MoveStrip', () => {
  test('numbers from the course start, Black first', () => {
    render(<MoveStrip sanMoves={['Nc6', 'Bb5']} classifiedMoves={[]} positions={[]} currentPly={0} momentPlies={[]} onSelect={vi.fn()} start={{ moveNumber: 2, blackFirst: true }} />);
    expect(screen.getByText('2...')).toBeTruthy();
    expect(screen.getByText('3.')).toBeTruthy();
  });
});
