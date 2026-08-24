import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SessionHeader } from './SessionHeader.js';

describe('SessionHeader (design.md §5.1/§5.2)', () => {
  test('shows the players and result', () => {
    render(<SessionHeader whiteName="daniel" blackName="Marta" result="1-0" onBack={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText(/daniel/)).toBeInTheDocument();
    expect(screen.getByText(/marta/i)).toBeInTheDocument();
    expect(screen.getByText('1-0')).toBeInTheDocument();
  });

  test('tapping back calls onBack', async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<SessionHeader whiteName="daniel" blackName="Marta" result={null} onBack={onBack} onReset={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  test('reset lives behind the ⋯ menu, not the bar itself', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<SessionHeader whiteName="daniel" blackName="Marta" result={null} onBack={vi.fn()} onReset={onReset} />);

    expect(screen.queryByRole('menuitem', { name: /reset session/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /session options/i }));
    await user.click(screen.getByRole('menuitem', { name: /reset session/i }));

    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menuitem', { name: /reset session/i })).not.toBeInTheDocument();
  });

  test('the menu closes on Escape without resetting', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<SessionHeader whiteName="daniel" blackName="Marta" result={null} onBack={vi.fn()} onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: /session options/i }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menuitem', { name: /reset session/i })).not.toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();
  });

  test('does not show "Debug last answer" in the menu when onDebug is omitted', async () => {
    const user = userEvent.setup();
    render(<SessionHeader whiteName="daniel" blackName="Marta" result={null} onBack={vi.fn()} onReset={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /session options/i }));
    expect(screen.queryByRole('menuitem', { name: /debug last answer/i })).not.toBeInTheDocument();
  });

  test('"Debug last answer" lives in the overflow menu, not the bar itself, when onDebug is provided', async () => {
    const onDebug = vi.fn();
    const user = userEvent.setup();
    render(
      <SessionHeader whiteName="daniel" blackName="Marta" result={null} onBack={vi.fn()} onReset={vi.fn()} onDebug={onDebug} />
    );

    expect(screen.queryByRole('button', { name: /debug last answer/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /session options/i }));
    await user.click(screen.getByRole('menuitem', { name: /debug last answer/i }));

    expect(onDebug).toHaveBeenCalledOnce();
  });

  test('"Debug last answer" stays visible but disabled (not hidden) until an assistant turn has completed', async () => {
    const onDebug = vi.fn();
    const user = userEvent.setup();
    render(
      <SessionHeader
        whiteName="daniel"
        blackName="Marta"
        result={null}
        onBack={vi.fn()}
        onReset={vi.fn()}
        onDebug={onDebug}
        debugDisabled
      />
    );

    await user.click(screen.getByRole('button', { name: /session options/i }));
    const debugItem = screen.getByRole('menuitem', { name: /debug last answer/i });
    expect(debugItem).toBeDisabled();

    await user.click(debugItem);
    expect(onDebug).not.toHaveBeenCalled();
  });
});
