import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { EvalBar } from './EvalBar.js';

const CLASSIFIED_MOVES = [{ ply: 1, evalAfterCp: 200 }] as ClassifiedMoveDto[];

describe('EvalBar', () => {
  test('defaults to a vertical bar filling from the bottom for white orientation', () => {
    render(<EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="white" />);

    const label = screen.getByLabelText(/evaluation:/i);
    expect(label.parentElement).not.toHaveClass('eval-bar-wrap--horizontal');
    const fill = label.querySelector('.eval-bar__fill') as HTMLElement;
    expect(fill.style.bottom).toBe('0px');
    expect(fill.style.height).not.toBe('');
  });

  test('horizontal layout fills from the right for white orientation, left for black', () => {
    const { rerender } = render(
      <EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="white" layout="horizontal" />
    );

    let label = screen.getByLabelText(/evaluation:/i);
    expect(label.parentElement).toHaveClass('eval-bar-wrap--horizontal');
    let fill = label.querySelector('.eval-bar__fill') as HTMLElement;
    expect(fill.style.right).toBe('0px');
    expect(fill.style.width).not.toBe('');

    rerender(<EvalBar ply={1} classifiedMoves={CLASSIFIED_MOVES} orientation="black" layout="horizontal" />);
    label = screen.getByLabelText(/evaluation:/i);
    fill = label.querySelector('.eval-bar__fill') as HTMLElement;
    expect(fill.style.left).toBe('0px');
  });
});
