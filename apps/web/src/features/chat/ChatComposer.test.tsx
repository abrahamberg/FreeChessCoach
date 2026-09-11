import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatComposer } from './ChatComposer.js';

describe('ChatComposer', () => {
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

  describe('collapsible (mobile: pinned to the bottom of the screen, the board sits above)', () => {
    test('starts collapsed behind a trigger button, not the always-open input', () => {
      render(<ChatComposer onSend={vi.fn()} collapsible />);

      expect(screen.getByRole('button', { name: /ask the coach a question/i })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /reply/i })).not.toBeInTheDocument();
    });

    test('tapping the trigger opens the composer; tapping "Close keyboard" collapses it back', async () => {
      const user = userEvent.setup();
      render(<ChatComposer onSend={vi.fn()} collapsible />);

      await user.click(screen.getByRole('button', { name: /ask the coach a question/i }));

      expect(screen.getByRole('textbox', { name: /reply/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /ask the coach a question/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /close keyboard/i }));

      expect(screen.getByRole('button', { name: /ask the coach a question/i })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /reply/i })).not.toBeInTheDocument();
    });

    test('sending a message leaves the composer open for the next reply', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      render(<ChatComposer onSend={onSend} collapsible />);
      await user.click(screen.getByRole('button', { name: /ask the coach a question/i }));

      await user.type(screen.getByRole('textbox', { name: /reply/i }), 'hello coach');
      await user.click(screen.getByRole('button', { name: /send/i }));

      expect(onSend).toHaveBeenCalledWith('hello coach');
      expect(screen.getByRole('textbox', { name: /reply/i })).toBeInTheDocument();
    });

    test('drawing a board arrow while collapsed opens the composer so the chip is reachable', () => {
      const { rerender } = render(<ChatComposer onSend={vi.fn()} collapsible boardArrows={[]} />);
      expect(screen.queryByRole('textbox', { name: /reply/i })).not.toBeInTheDocument();

      rerender(<ChatComposer onSend={vi.fn()} collapsible boardArrows={[{ from: 'e2', to: 'e4' }]} />);

      expect(screen.getByTestId('arrow-chip')).toBeInTheDocument();
      expect(screen.getAllByRole('textbox', { name: /reply/i }).length).toBeGreaterThan(0);
    });
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
