import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { UnlockPhraseModal } from './UnlockPhraseModal.js';

describe('UnlockPhraseModal', () => {
  test('submits the typed phrase via onUnlock', async () => {
    const onUnlock = vi.fn();
    const user = userEvent.setup();
    render(
      <UnlockPhraseModal onClose={vi.fn()} onUnlock={onUnlock} onUnlocked={vi.fn()} isPending={false} isSuccess={false} />
    );

    await user.type(screen.getByLabelText('Unlock phrase'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(onUnlock).toHaveBeenCalledWith('correct horse battery staple');
  });

  test('shows a checking state while pending, disabling the submit button', () => {
    render(
      <UnlockPhraseModal onClose={vi.fn()} onUnlock={vi.fn()} onUnlocked={vi.fn()} isPending={true} isSuccess={false} />
    );

    expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  test('shows the server error message on a wrong phrase', () => {
    render(
      <UnlockPhraseModal
        onClose={vi.fn()}
        onUnlock={vi.fn()}
        onUnlocked={vi.fn()}
        isPending={false}
        isSuccess={false}
        errorMessage="That unlock phrase is incorrect."
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('That unlock phrase is incorrect.');
  });

  test('shows a success confirmation and hands off to onUnlocked shortly after', async () => {
    vi.useFakeTimers();
    const onUnlocked = vi.fn();
    render(<UnlockPhraseModal onClose={vi.fn()} onUnlock={vi.fn()} onUnlocked={onUnlocked} isPending={false} isSuccess={true} />);

    expect(screen.getByRole('status')).toHaveTextContent('AI setup unlocked.');
    expect(onUnlocked).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onUnlocked).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('closing via the modal chrome calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UnlockPhraseModal onClose={onClose} onUnlock={vi.fn()} onUnlocked={vi.fn()} isPending={false} isSuccess={false} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
