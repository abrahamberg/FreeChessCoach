import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatPane } from './ChatPane.js';

describe('ChatPane', () => {
  test('sends the input text and clears it', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPane messages={[]} activeToolName={null} onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /reply/i }), 'hello coach');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('hello coach');
    expect(screen.getByRole('textbox', { name: /reply/i })).toHaveValue('');
  });

  test('does not send an empty message', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPane messages={[]} activeToolName={null} onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).not.toHaveBeenCalled();
  });

  test('allows an empty-text send when a diverged line is pending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatPane messages={[]} activeToolName={null} onSend={onSend} hasPendingLine />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('');
  });

  test('forwards onSelectPly through to MessageList', () => {
    const onSelectPly = vi.fn();
    render(
      <ChatPane
        messages={[{ id: '1', role: 'assistant', text: '[position_divider]|14|Bg4' }]}
        activeToolName={null}
        onSend={vi.fn()}
        onSelectPly={onSelectPly}
      />
    );

    screen.getByRole('button', { name: /move 7/i }).click();

    expect(onSelectPly).toHaveBeenCalledWith(14);
  });

  test('forwards fen and onHoverMove through to MessageList so it can resolve move mentions', async () => {
    const onHoverMove = vi.fn();
    const user = userEvent.setup();
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    render(
      <ChatPane
        messages={[{ id: '1', role: 'assistant', text: 'what about b3 here?' }]}
        activeToolName={null}
        onSend={vi.fn()}
        fen={fen}
        onHoverMove={onHoverMove}
      />
    );

    await user.hover(screen.getByText('b3'));

    expect(onHoverMove).toHaveBeenCalledWith({ from: 'b2', to: 'b3' });
  });

  test('shows tool activity for a visible tool', () => {
    render(<ChatPane messages={[]} activeToolName="get_engine_analysis" onSend={vi.fn()} />);
    expect(screen.getByText(/checking a line/i)).toBeInTheDocument();
  });

  test('design.md §5.7: a board-drawn arrow appears as a chip in the reply box, and sending it includes the bracketed token', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ChatPane messages={[]} activeToolName={null} onSend={onSend} boardArrows={[]} />);

    rerender(
      <ChatPane messages={[]} activeToolName={null} onSend={onSend} boardArrows={[{ from: 'e2', to: 'e4' }]} />
    );

    expect(screen.getByTestId('arrow-chip')).toBeInTheDocument();

    await user.type(screen.getAllByRole('textbox', { name: /reply/i }).at(-1) as HTMLElement, 'looks strong');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('[e2-e4]looks strong');
  });

  test('erasing a drawn arrow (board reports it gone) removes its chip from the reply box', () => {
    const { rerender } = render(
      <ChatPane
        messages={[]}
        activeToolName={null}
        onSend={vi.fn()}
        boardArrows={[{ from: 'e2', to: 'e4' }]}
      />
    );
    expect(screen.getByTestId('arrow-chip')).toBeInTheDocument();

    rerender(<ChatPane messages={[]} activeToolName={null} onSend={vi.fn()} boardArrows={[]} />);

    expect(screen.queryByTestId('arrow-chip')).not.toBeInTheDocument();
  });

  test('keeps the coach identity visible when autoplay is unavailable', () => {
    render(<ChatPane messages={[]} activeToolName={null} onSend={vi.fn()} />);
    expect(screen.getByText('Coach')).toBeInTheDocument();
    expect(screen.getByTestId('coach-avatar')).toHaveAttribute('data-coach-persona', 'general');
    expect(screen.getByRole('link', { name: /change coach/i })).toHaveAttribute('href', '/settings');
    expect(screen.queryByText(/male|female|\d+s/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /automatic coach voice/i })).not.toBeInTheDocument();
  });

  test('renders the selected coach and forwards the speaker toggle', async () => {
    const onToggleAutoplay = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatPane
        messages={[]}
        activeToolName={null}
        onSend={vi.fn()}
        coachPersona="gambler"
        autoplayEnabled={false}
        onToggleAutoplay={onToggleAutoplay}
      />
    );

    expect(screen.getByText('The Gambler')).toBeInTheDocument();
    expect(screen.getByTestId('coach-avatar')).toHaveAttribute('data-coach-persona', 'gambler');
    expect(screen.queryByText(/male|female|\d+s/i)).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /enable automatic coach voice/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(onToggleAutoplay).toHaveBeenCalledWith(true);
  });

  test('forwards onPlayMessage/onStopMessage/playingMessageId/loadingMessageId through to MessageList', async () => {
    const onPlayMessage = vi.fn();
    const onStopMessage = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatPane
        messages={[{ id: 'm1', role: 'assistant', text: 'Good move.' }]}
        activeToolName={null}
        onSend={vi.fn()}
        onPlayMessage={onPlayMessage}
        onStopMessage={onStopMessage}
        playingMessageId="m1"
      />
    );

    const playButton = screen.getByRole('button', { name: 'Stop coach message' });
    expect(playButton).toHaveAttribute('data-state', 'playing');
    await user.click(playButton);
    expect(onStopMessage).toHaveBeenCalledTimes(1);
    expect(onPlayMessage).not.toHaveBeenCalled();
  });
});
