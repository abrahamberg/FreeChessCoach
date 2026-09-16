import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ExplorePanel } from './ExplorePanel.js';
import type { UseWasmEngineResult } from '../../hooks/useWasmEngine.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function makeEngine(overrides: Partial<UseWasmEngineResult> = {}): UseWasmEngineResult {
  return { status: 'idle', evaluation: null, bestMoveArrow: null, analyze: vi.fn(), ...overrides };
}

describe('ExplorePanel', () => {
  test('collapsed by default, showing only the small "Explore on your own" icon toggle', () => {
    render(
      <ExplorePanel fen={START_FEN} mode="answer" onEnterPeekMode={vi.fn()} onExitPeekMode={vi.fn()} engine={makeEngine()} />
    );

    expect(screen.getByRole('button', { name: /explore on your own/i })).toBeInTheDocument();
    expect(document.querySelector('.explore-panel-pill')).not.toBeInTheDocument();
  });

  test('expanding calls analyze(fen), enters peek mode, and shows the compact exploration pill', async () => {
    const analyze = vi.fn();
    const onEnterPeekMode = vi.fn();
    const user = userEvent.setup();
    render(
      <ExplorePanel
        fen={START_FEN}
        mode="answer"
        onEnterPeekMode={onEnterPeekMode}
        onExitPeekMode={vi.fn()}
        engine={makeEngine({ analyze })}
      />
    );

    await user.click(screen.getByRole('button', { name: /explore on your own/i }));

    expect(analyze).toHaveBeenCalledWith(START_FEN);
    expect(onEnterPeekMode).toHaveBeenCalledOnce();
    expect(document.querySelector('.explore-panel-pill')).toBeInTheDocument();
  });

  test('renders the word-based evaluation once available, never a number', async () => {
    const user = userEvent.setup();
    render(
      <ExplorePanel
        fen={START_FEN}
        mode="answer"
        onEnterPeekMode={vi.fn()}
        onExitPeekMode={vi.fn()}
        engine={makeEngine({ status: 'ready', evaluation: 'White is better' })}
      />
    );

    await user.click(screen.getByRole('button', { name: /explore on your own/i }));

    expect(screen.getByText('White is better')).toBeInTheDocument();
  });

  test('the pill\'s own close icon exits peek mode', async () => {
    const onExitPeekMode = vi.fn();
    const user = userEvent.setup();
    render(
      <ExplorePanel fen={START_FEN} mode="answer" onEnterPeekMode={vi.fn()} onExitPeekMode={onExitPeekMode} engine={makeEngine()} />
    );

    await user.click(screen.getByRole('button', { name: /explore on your own/i }));
    await user.click(screen.getByRole('button', { name: /stop exploring/i }));

    expect(onExitPeekMode).toHaveBeenCalledOnce();
  });

  test('collapses back to the toggle once the board leaves peek mode (e.g. "back to coach")', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ExplorePanel fen={START_FEN} mode="answer" onEnterPeekMode={vi.fn()} onExitPeekMode={vi.fn()} engine={makeEngine()} />
    );

    await user.click(screen.getByRole('button', { name: /explore on your own/i }));
    rerender(
      <ExplorePanel fen={START_FEN} mode="peek" onEnterPeekMode={vi.fn()} onExitPeekMode={vi.fn()} engine={makeEngine()} />
    );
    expect(document.querySelector('.explore-panel-pill')).toBeInTheDocument();

    rerender(
      <ExplorePanel fen={START_FEN} mode="answer" onEnterPeekMode={vi.fn()} onExitPeekMode={vi.fn()} engine={makeEngine()} />
    );

    expect(document.querySelector('.explore-panel-pill')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore on your own/i })).toBeInTheDocument();
  });
});
