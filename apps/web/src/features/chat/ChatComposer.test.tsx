import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatComposer } from './ChatComposer.js';

describe('ChatComposer', () => {
  test('the reply field and send button are always visible — no tap-to-reveal step', () => {
    render(<ChatComposer onSend={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: /reply/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  test('sends the input text and clears it', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} />);

    await user.type(screen.getByRole('textbox', { name: /reply/i }), 'hello coach');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('hello coach');
    expect(screen.getByRole('textbox', { name: /reply/i })).toHaveValue('');
  });

  test('does not send an empty message', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).not.toHaveBeenCalled();
  });

  test('allows an empty-text send when a diverged line is pending', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatComposer onSend={onSend} hasPendingLine />);

    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('');
  });

  test('design.md §5.7: a board-drawn arrow appears as a chip in the reply box, and sending it includes the bracketed token', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<ChatComposer onSend={onSend} boardArrows={[]} />);

    rerender(<ChatComposer onSend={onSend} boardArrows={[{ from: 'e2', to: 'e4' }]} />);

    expect(screen.getByTestId('arrow-chip')).toBeInTheDocument();

    await user.type(screen.getAllByRole('textbox', { name: /reply/i }).at(-1) as HTMLElement, 'looks strong');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('[e2-e4]looks strong');
  });

  test('erasing a drawn arrow (board reports it gone) removes its chip from the reply box', () => {
    const { rerender } = render(<ChatComposer onSend={vi.fn()} boardArrows={[{ from: 'e2', to: 'e4' }]} />);
    expect(screen.getByTestId('arrow-chip')).toBeInTheDocument();

    rerender(<ChatComposer onSend={vi.fn()} boardArrows={[]} />);

    expect(screen.queryByTestId('arrow-chip')).not.toBeInTheDocument();
  });
});
