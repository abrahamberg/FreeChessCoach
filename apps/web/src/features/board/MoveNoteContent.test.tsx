import { render, screen } from '@testing-library/react';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { hasMoveNoteText, MoveNote, OpeningLabel } from './MoveNoteContent.js';

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

describe('a mating move', () => {
  // Légal's mate, 7.Nd5#: the move's only sentence is its tactic card ("You
  // delivered checkmate."), which Game Review shows in TacticReasonList. The
  // note under it must not also say "Nothing to flag".
  const mate = {
    ply: 13,
    moveSan: 'Nd5#',
    quality: 'best',
    isUserMove: true,
    bestLineSan: [],
    bestMoveSan: 'Nd5#',
    reasons: ['You delivered checkmate.'],
    tacticOpportunity: { type: 'checkmate', found: true, detail: null, visual: null, embodiedBySan: 'Nd5#' },
    story: { notes: [], ideas: [], alternatives: [], bestInstead: null }
  } as unknown as ClassifiedMoveDto;

  test('counts its tactic card as the note', () => {
    expect(hasMoveNoteText(mate, true)).toBe(true);
    expect(hasMoveNoteText({ ...mate, story: undefined } as ClassifiedMoveDto, true)).toBe(true);
  });
});
