import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { EvalBar } from './EvalBar.js';

const CLASSIFIED_MOVES = [{ ply: 1, evalAfterCp: 200 }] as ClassifiedMoveDto[];

describe('EvalBar', () => {
  test('fills from the bottom for white orientation, top for black', () => {
    const { rerender } = render(<EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="white" />);

    let label = screen.getByLabelText(/evaluation:/i);
    let fill = label.querySelector('.eval-bar__fill') as HTMLElement;
    expect(fill.style.bottom).toBe('0px');
    expect(fill.style.height).not.toBe('');

    rerender(<EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="black" />);
    label = screen.getByLabelText(/evaluation:/i);
    fill = label.querySelector('.eval-bar__fill') as HTMLElement;
    expect(fill.style.top).toBe('0px');
  });

  test('defaults to an even 0cp label when the current ply has no classified move yet', () => {
    render(<EvalBar ply={0} classifiedMoves={CLASSIFIED_MOVES} orientation="white" />);
    expect(screen.getByLabelText('Evaluation: 0.0')).toBeInTheDocument();
  });

  test('cpOverride wins over the classifiedMoves/ply lookup — the Explore sandbox has no classified move to look up', () => {
    render(<EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="white" cpOverride={-150} />);
    expect(screen.getByLabelText('Evaluation: -1.5')).toBeInTheDocument();
  });
});
