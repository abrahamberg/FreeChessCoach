import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { PagedMessageCard } from './PagedMessageCard.js';

describe('PagedMessageCard', () => {
  test('an assistant message shows the coach portrait on the left, no user initials', () => {
    const messages = [{ id: 'm1', role: 'assistant' as const, text: 'Good move.' }];
    render(<PagedMessageCard message={messages[0]} index={0} visible={messages} coachPersona="general" />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
    expect(screen.queryByTestId('user-avatar')).not.toBeInTheDocument();
    expect(screen.getByText('Good move.').closest('.paged-message-card')).not.toHaveClass('paged-message-card--user');
  });

  test('a user message shows their own initials on the right, no coach portrait, and the user color/margin', () => {
    const messages = [{ id: 'm1', role: 'user' as const, text: 'Thanks!' }];
    render(
      <PagedMessageCard message={messages[0]} index={0} visible={messages} coachPersona="general" displayName="Dany_Abr" />
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
    render(<PagedMessageCard message={messages[1]} index={1} visible={messages} coachPersona="general" />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
  });

  test('no messages yet: still shows the coach portrait beside the empty-state text', () => {
    render(<PagedMessageCard message={undefined} index={0} visible={[]} coachPersona="general" />);

    expect(screen.getByTestId('coach-avatar')).toBeInTheDocument();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  test('onToggleAutoplay renders the voice toggle as the row\'s own action, replacing MobileCoachSessionBody\'s old dedicated header', async () => {
    const onToggleAutoplay = vi.fn();
    const user = userEvent.setup();
    const messages = [{ id: 'm1', role: 'assistant' as const, text: 'Good move.' }];
    render(
      <PagedMessageCard
        message={messages[0]}
        index={0}
        visible={messages}
        coachPersona="general"
        autoplayEnabled={false}
        onToggleAutoplay={onToggleAutoplay}
      />
    );

    const toggle = screen.getByRole('button', { name: /enable automatic coach voice/i });
    await user.click(toggle);
    expect(onToggleAutoplay).toHaveBeenCalledWith(true);
  });

  test('no onToggleAutoplay: no voice toggle rendered', () => {
    const messages = [{ id: 'm1', role: 'assistant' as const, text: 'Good move.' }];
    render(<PagedMessageCard message={messages[0]} index={0} visible={messages} coachPersona="general" />);

    expect(screen.queryByRole('button', { name: /automatic coach voice/i })).not.toBeInTheDocument();
  });
});
