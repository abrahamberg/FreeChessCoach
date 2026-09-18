import type { LlmSetupTestResponse } from '@freechesscoach/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { LlmSetupForm } from './LlmSetupForm.js';

const EMPTY_SETUP = { configured: false, unlocked: false, voiceAvailable: false };

const PASSING_RESULT: LlmSetupTestResponse = {
  protocol: 'openai-chat',
  low: { model: 'gpt-5.6-luna', ok: true },
  high: { model: 'gpt-5.6-terra', ok: true },
  voice: null
};

const FAILING_RESULT: LlmSetupTestResponse = {
  protocol: null,
  low: { model: 'gpt-5.6-luna', ok: false, error: 'Could not reach the endpoint' },
  high: { model: 'gpt-5.6-terra', ok: false, error: 'Could not reach the endpoint' },
  voice: null
};

describe('LlmSetupForm', () => {
  test('starts on the connect step; "Test connection" is the only way forward, no manual skip-ahead', async () => {
    const onTest = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={onTest}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
      />
    );

    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
    expect(screen.getByText('Connect your AI').closest('li')).toHaveClass('is-active');
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('API key'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    expect(onTest).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'secret' }));
  });

  test('a test in flight replaces the form with a loader, not just disabling it', () => {
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting
        isSaving={false}
      />
    );

    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/testing your connection/i);
  });

  test('a finished test replaces the form with just its result, not alongside it', () => {
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={PASSING_RESULT}
      />
    );

    expect(screen.getByText('Detected format')).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
  });

  test('a passing result offers Back and Proceed; Proceed opens the phrase step', async () => {
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={PASSING_RESULT}
      />
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Proceed' }));

    expect(screen.getByLabelText('Unlock phrase (8+ characters)')).toBeInTheDocument();
    expect(screen.getByText('Set an unlock phrase').closest('li')).toHaveClass('is-active');
  });

  test('a failing result offers Back and Try again instead of Proceed', async () => {
    const onTest = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={onTest}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={FAILING_RESULT}
      />
    );

    expect(screen.queryByRole('button', { name: 'Proceed' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  test('Back from the result step returns to the connect form with the previously entered details intact', async () => {
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={PASSING_RESULT}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('API key')).toHaveValue('');
    expect(screen.getByLabelText('Low model')).toHaveValue(PASSING_RESULT.low.model);
    expect(screen.queryByText('Detected format')).not.toBeInTheDocument();
  });

  test('Back from the phrase step returns to the result step, not straight to the form', async () => {
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={PASSING_RESULT}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Proceed' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('Detected format')).toBeInTheDocument();
    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).not.toBeInTheDocument();
  });

  test('submitting the phrase calls onSave with the full setup, and a save in flight shows a loader', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={onSave}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving={false}
        testResult={PASSING_RESULT}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Proceed' }));
    await user.type(screen.getByLabelText('Unlock phrase (8+ characters)'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ lowModel: 'gpt-5.6-luna', highModel: 'gpt-5.6-terra' }),
      'correct horse battery staple'
    );
  });

  test('a save in flight replaces the phrase step with a loader', () => {
    render(
      <LlmSetupForm
        status={EMPTY_SETUP}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        isTesting={false}
        isSaving
        testResult={PASSING_RESULT}
      />
    );

    expect(screen.queryByLabelText('Unlock phrase (8+ characters)')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/saving your setup/i);
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
        isTesting={false}
        isSaving={false}
      />
    );

    expect(screen.queryByLabelText(/unlock phrase/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enter unlock phrase' }));
    expect(onUnlockClick).toHaveBeenCalledTimes(1);
  });

  test('replacing a configured setup starts a fresh wizard and notifies the caller to clear the old test/save result', async () => {
    const onStartEditing = vi.fn();
    const user = userEvent.setup();
    render(
      <LlmSetupForm
        status={{ configured: true, unlocked: true, protocol: 'openai-chat', lowModel: 'luna', highModel: 'terra', voiceAvailable: false }}
        onTest={vi.fn()}
        onSave={vi.fn()}
        onUnlockClick={vi.fn()}
        onLock={vi.fn()}
        onDelete={vi.fn()}
        onStartEditing={onStartEditing}
        isTesting={false}
        isSaving={false}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Replace setup' }));

    expect(onStartEditing).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });
});
