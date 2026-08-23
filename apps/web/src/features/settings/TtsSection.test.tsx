import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { TtsSection } from './TtsSection.js';

describe('TtsSection', () => {
  test('disabled by default, backend picker hidden until enabled', () => {
    render(<TtsSection enabled={false} backend="openai" onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: /enable coach voice/i })).not.toBeChecked();
    expect(screen.queryByRole('radiogroup', { name: /coach voice backend/i })).not.toBeInTheDocument();
  });

  test('turning the switch off applies immediately, no dialog', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={true} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /enable coach voice/i }));

    expect(onChange).toHaveBeenCalledWith({ ttsEnabled: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('turning the switch on shows a confirmation dialog before applying', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={false} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /enable coach voice/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(/credits/i);

    await user.click(screen.getByRole('button', { name: /use openai voice/i }));
    expect(onChange).toHaveBeenCalledWith({ ttsEnabled: true });
  });

  test('cancelling the enable dialog leaves it off (undo)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={false} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('checkbox', { name: /enable coach voice/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: /enable coach voice/i })).not.toBeChecked();
  });

  test('selecting the browser backend warns about local speed before applying', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={true} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /browser voice/i }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(/slower/i);

    await user.click(screen.getByRole('button', { name: /use browser voice/i }));
    expect(onChange).toHaveBeenCalledWith({ ttsBackend: 'browser' });
  });

  test('cancelling a backend switch leaves the previous backend selected (undo)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={true} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /browser voice/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /openai voice/i })).toBeChecked();
  });

  test('re-selecting the already-active backend does not prompt', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TtsSection enabled={true} backend="openai" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /openai voice/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
