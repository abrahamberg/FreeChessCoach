import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { CoachMessage } from '../../hooks/useCoachChat.js';
import { PagedMessageCard } from './PagedMessageCard.js';
import type { UseMessagePagingResult } from './useMessagePaging.js';

function pagingAt(visible: CoachMessage[], index: number): UseMessagePagingResult {
  return { visible, index, current: visible[index], total: visible.length, goTo: () => undefined };
}

describe('PagedMessageCard', () => {
  test('an assistant message shows the coach portrait, no user initials', () => {
    const messages = [{ id: 'm1', role: 'assistant' as const, text: 'Good move.' }];
    render(<PagedMessageCard messagePaging={pagingAt(messages, 0)} coachPersona="general" isThinking={false} activeToolName={null} />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
    expect(screen.getByText('Good move.').closest('.paged-message-card')).not.toHaveClass('paged-message-card--user');
  });

  test('a user message shows their own initials, no coach portrait, and the user color/margin', () => {
    const messages = [{ id: 'm1', role: 'user' as const, text: 'Thanks!' }];
    render(
      <PagedMessageCard
        messagePaging={pagingAt(messages, 0)}
        coachPersona="general"
        displayName="Dany_Abr"
        isThinking={false}
        activeToolName={null}
      />
    );

    expect(screen.getByTestId('user-avatar')).toHaveTextContent('DA');
    expect(screen.queryByTestId('coach-avatar')).not.toBeInTheDocument();
    expect(screen.getByText('Thanks!').closest('.paged-message-card')).toHaveClass('paged-message-card--user');
  });

  test('the coach avatar renders for every assistant message shown, not just the first of a run (no adjacent message to compare against)', () => {
    const messages = [
      { id: 'm1', role: 'assistant' as const, text: 'First.' },
      { id: 'm2', role: 'assistant' as const, text: 'Second.' }
    ];
    render(<PagedMessageCard messagePaging={pagingAt(messages, 1)} coachPersona="general" isThinking={false} activeToolName={null} />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
  });

  test('no messages yet: still shows the coach portrait beside the empty-state text, with no expand toggle', () => {
    render(<PagedMessageCard messagePaging={pagingAt([], 0)} coachPersona="general" isThinking={false} activeToolName={null} />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show more/i })).not.toBeInTheDocument();
  });

  // Regression: the placeholder assistant message (empty text) is filtered
  // out of `visible` (useMessagePaging.ts), so `current` stays undefined the
  // whole time the coach is thinking with nothing visible yet — this used to
  // fall straight to the static "No messages yet." text and never render the
  // thinking indicator at all, most visibly during a session's kickoff turn.
  describe('no visible messages yet, but the coach is thinking', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test('shows the thinking indicator (with its label) instead of "no messages yet"', () => {
      render(
        <PagedMessageCard
          messagePaging={pagingAt([], 0)}
          coachPersona="general"
          isThinking={true}
          thinkingLabel="Studying your game…"
          activeToolName={null}
        />
      );
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByRole('status', { name: /studying your game/i })).toBeInTheDocument();
      expect(screen.queryByText(/no messages yet/i)).not.toBeInTheDocument();
    });
  });

  test('the expand toggle grows the card and flips to "show less", then back', async () => {
    const user = userEvent.setup();
    const messages = [{ id: 'm1', role: 'assistant' as const, text: 'Good move.' }];
    render(<PagedMessageCard messagePaging={pagingAt(messages, 0)} coachPersona="general" isThinking={false} activeToolName={null} />);

    const toggle = screen.getByRole('button', { name: /show more/i });
    expect(screen.getByText('Good move.').closest('.coach-card')).not.toHaveClass('coach-card--expanded');

    await user.click(toggle);
    expect(screen.getByText('Good move.').closest('.coach-card')).toHaveClass('coach-card--expanded');
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show less/i }));
    expect(screen.getByText('Good move.').closest('.coach-card')).not.toHaveClass('coach-card--expanded');
  });
});
