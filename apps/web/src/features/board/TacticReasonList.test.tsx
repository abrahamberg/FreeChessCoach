import type { ClassifiedMoveDto } from '@freechesscoach/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { TacticReasonList, tacticReasonTexts } from './TacticReasonList.js';

function baseMove(overrides: Partial<ClassifiedMoveDto> = {}): ClassifiedMoveDto {
  return {
    ply: 10,
    moveSan: 'Nxe4',
    mover: 'black',
    isUserMove: true,
    cpLoss: 0,
    quality: 'mistake',
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  } as ClassifiedMoveDto;
}

describe('TacticReasonList', () => {
  test('renders nothing when the move has no tactic data', () => {
    const { container } = render(<TacticReasonList move={baseMove()} selection={null} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders a clickable prevention sentence and a static (no-visual) opportunity sentence', () => {
    const move = baseMove({
      tacticPrevention: {
        type: 'fork',
        prevented: false,
        detail: 'pawn on e5 forks d6 and f6',
        visual: { arrows: [{ from: 'e5', to: 'd6' }], highlights: [] }
      },
      tacticOpportunity: { type: 'trappedPiece', found: false, detail: 'pawn on e4 is trapped' }
    });
    render(<TacticReasonList move={move} selection={null} onToggle={vi.fn()} />);

    const preventionButton = screen.getByRole('button', { name: /Left the opponent's fork in play/ });
    expect(preventionButton.tagName).toBe('BUTTON');
    expect(screen.getByText(/Missed a trapped piece/)).toBeInstanceOf(HTMLParagraphElement);
  });

  test('clicking a clickable sentence calls onToggle with its key', () => {
    const move = baseMove({
      tacticOpportunity: {
        type: 'fork',
        found: true,
        detail: 'knight on d6 forks e8 and b7',
        visual: { arrows: [{ from: 'd6', to: 'e8' }], highlights: [] }
      }
    });
    const onToggle = vi.fn();
    render(<TacticReasonList move={move} selection={null} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: /Found the fork/ }));
    expect(onToggle).toHaveBeenCalledWith('opportunity');
  });

  test('the active sentence gets the active styling and a close affordance', () => {
    const move = baseMove({
      tacticOpportunity: {
        type: 'fork',
        found: true,
        detail: 'knight on d6 forks e8 and b7',
        visual: { arrows: [{ from: 'd6', to: 'e8' }], highlights: [] }
      }
    });
    render(<TacticReasonList move={move} selection="opportunity" onToggle={vi.fn()} />);

    const button = screen.getByRole('button', { name: /Found the fork/ });
    expect(button).toHaveClass('tactic-reason-item--active');
  });

  test('the "show tactic arrows" toggle only appears once a visual exists, and reflects the "all" selection', () => {
    const noVisual = baseMove({ tacticOpportunity: { type: 'fork', found: true, detail: 'x' } });
    const { rerender } = render(<TacticReasonList move={noVisual} selection={null} onToggle={vi.fn()} />);
    expect(screen.queryByText('Show tactic arrows')).not.toBeInTheDocument();

    const withVisual = baseMove({
      tacticOpportunity: { type: 'fork', found: true, detail: 'x', visual: { arrows: [{ from: 'a1', to: 'a2' }], highlights: [] } }
    });
    rerender(<TacticReasonList move={withVisual} selection="all" onToggle={vi.fn()} />);
    expect(screen.getByText('Hide tactic arrows')).toHaveClass('tactic-reason-list__toggle-all--active');
  });
});

describe('tacticReasonTexts', () => {
  test('names exactly the sentences TacticReasonList would show', () => {
    const move = baseMove({
      tacticPrevention: { type: 'fork', prevented: false, detail: 'pawn on e5 forks d6 and f6' },
      tacticOpportunity: { type: 'trappedPiece', found: false, detail: 'pawn on e4 is trapped' }
    });
    expect(tacticReasonTexts(move)).toEqual(
      new Set(["Left the opponent's fork in play — pawn on e5 forks d6 and f6.", 'Missed a trapped piece — pawn on e4 is trapped.'])
    );
  });
});
