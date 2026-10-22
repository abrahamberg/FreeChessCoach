import { render, screen } from '@testing-library/react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { MoveNote, OpeningLabel } from './MoveNoteContent.js';

describe('a book move', () => {
  test('shows its theory label once, then what the move does', () => {
    const move = { ply: 1, moveSan: 'e4', quality: 'book', bestLineSan: [], reasons: ['Theory — Italian Game (C53)', 'Puts a pawn in the centre on e4', 'Controls d5 and f5'] } as unknown as ClassifiedMoveDto;
    render(
      <>
        <OpeningLabel move={move} />
        <MoveNote move={move} excludeTacticText />
      </>
    );
    expect(screen.getAllByText(/^Theory/)).toHaveLength(1);
    expect(screen.getByText('Puts a pawn in the centre on e4')).toBeTruthy();
    expect(screen.getByText('Controls d5 and f5')).toBeTruthy();
  });
});
