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

    const preventionButton = screen.getByRole('button', { name: /They can still land a fork/ });
    expect(preventionButton.tagName).toBe('BUTTON');
    expect(screen.getByText(/You missed a chance to trap a piece/)).toBeInstanceOf(HTMLParagraphElement);
  });

  test('a blunder opens with the chance it missed, not with what it happened to stop', () => {
    // The order is orderTacticCards' call, not this component's — the same
    // rule build-game-report.ts orders the plain-text `reasons` by.
    const move = baseMove({
      quality: 'blunder',
      tacticPrevention: {
        type: 'discoveredAttack',
        prevented: true,
        detail: 'unveils the bishop on e7 against the bishop on g5',
        gain: { kind: 'material', pawns: 3, prize: 'bishop' }
      },
      tacticOpportunity: {
        type: 'trappedPiece',
        found: false,
        detail: 'queen on d7 is trapped',
        gain: { kind: 'material', pawns: 9, prize: 'queen' }
      }
    });
    const { container } = render(<TacticReasonList move={move} selection={null} onToggle={vi.fn()} />);

    const sentences = [...container.querySelectorAll('.tactic-reason-item')].map((item) => item.textContent);
    expect(sentences[0]).toMatch(/You missed a chance to win a queen/);
    expect(sentences[1]).toMatch(/You stopped them winning a bishop/);
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

    fireEvent.click(screen.getByRole('button', { name: /You landed a fork/ }));
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

    const button = screen.getByRole('button', { name: /You landed a fork/ });
    expect(button).toHaveClass('tactic-reason-item--active');
  });

  test('the "all" selection marks every sentence with a visual as active, since the board draws all of them', () => {
    const move = baseMove({
      tacticPrevention: {
        type: 'fork',
        prevented: false,
        detail: 'pawn on e5 forks d6 and f6',
        visual: { arrows: [{ from: 'e5', to: 'd6' }], highlights: [] }
      },
      tacticOpportunity: {
        type: 'trappedPiece',
        found: false,
        // No visual — nothing drawn for this one even under 'all', so it
        // should not read as active despite the toggle being on.
        detail: 'pawn on e4 is trapped'
      }
    });
    render(<TacticReasonList move={move} selection="all" onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: /They can still land a fork/ })).toHaveClass('tactic-reason-item--active');
    // The opportunity sentence has no visual, so it stays a static <p>, never a button.
    expect(screen.queryByRole('button', { name: /You missed a chance to trap a piece/ })).not.toBeInTheDocument();
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
      new Set([
        'They can still land a fork — pawn on e5 forks d6 and f6.',
        'You missed a chance to trap a piece — pawn on e4 is trapped.'
      ])
    );
  });
});
