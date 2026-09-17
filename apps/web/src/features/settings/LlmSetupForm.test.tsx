import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LlmSetupForm } from './LlmSetupForm.js';

const EMPTY_SETUP = { configured: false, unlocked: false, voiceAvailable: false };

describe('LlmSetupForm', () => {
  test('splits setup into a connect step then an unlock-phrase step, showing "1 of 2" progress', async () => {
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    // Step 1: connection fields only, no phrase field yet.
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
    expect(screen.getByText('Connect your AI').closest('li')).toHaveClass('is-active');

    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Step 2: phrase field only, connection fields gone but not lost.
    expect(screen.getByLabelText('Unlock phrase (8+ characters)')).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(screen.getByText('Set an unlock phrase').closest('li')).toHaveClass('is-active');
  });

  test('Back returns to step 1 with the previously entered connection details intact', async () => {
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('API key')).toHaveValue('secret');
  });

  test('onSave only fires once both steps are completed, with the full setup and phrase', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm status={EMPTY_SETUP} onTest={vi.fn()} onSave={onSave} onUnlockClick={vi.fn()} onLock={vi.fn()} onDelete={vi.fn()} />
    );

    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onSave).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Unlock phrase (8+ characters)'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'secret' }), 'correct horse battery staple');
  });

  test('a locked, already-configured setup opens the unlock popup via onUnlockClick instead of an inline form', async () => {
    const onUnlockClick = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={{ configured: true, unlocked: false, voiceAvailable: false }}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={onUnlockClick}
        onLock={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.queryByLabelText(/unlock phrase/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter unlock phrase' }));
    expect(onUnlockClick).toHaveBeenCalledTimes(1);
  });
});
