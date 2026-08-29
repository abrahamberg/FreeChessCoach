import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { EngineActivityIndicator } from './EngineActivityIndicator.js';
import type { EngineActivityIndicatorState } from '../hooks/useEngineActivityIndicator.js';

function renderIndicator(state: EngineActivityIndicatorState) {
  return render(
    <MemoryRouter>
      <EngineActivityIndicator state={state} />
    </MemoryRouter>
  );
}

describe('EngineActivityIndicator', () => {
  test('idle is a real, permanently-visible state — not hidden — and names the configured engine', () => {
    renderIndicator({ kind: 'idle', engineMode: 'native' });

    expect(screen.getByText('Internal')).toBeInTheDocument();
  });

  test('links directly to the engine settings section regardless of state', () => {
    renderIndicator({ kind: 'idle', engineMode: 'browser' });

    expect(screen.getByRole('link')).toHaveAttribute('href', '/settings#settings-engine');
  });

  test('unknown engine mode (before the first SSE frame arrives) falls back to a generic label instead of crashing', () => {
    renderIndicator({ kind: 'idle', engineMode: null });

    expect(screen.getByText('Engine')).toBeInTheDocument();
  });

  test('analyzing state reports the badge, percent, and speed together', () => {
    renderIndicator({
      kind: 'analyzing',
      engineMode: 'chess_api',
      percent: 42,
      etaText: '30s',
      speedPerSec: 20,
      count: 1,
      queueDepth: 0
    });

    expect(screen.getByText(/External/)).toBeInTheDocument();
    expect(screen.getByText(/42%/)).toBeInTheDocument();
    expect(screen.getByText(/20\/s/)).toBeInTheDocument();
  });

  test('a queue bar only appears when something is actually queued behind the running analysis', () => {
    const { container, rerender } = renderIndicator({
      kind: 'analyzing',
      engineMode: 'native',
      percent: 10,
      etaText: null,
      speedPerSec: null,
      count: 1,
      queueDepth: 0
    });
    expect(container.querySelector('.engine-activity-indicator__queue')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <EngineActivityIndicator
          state={{ kind: 'analyzing', engineMode: 'native', percent: 10, etaText: null, speedPerSec: null, count: 3, queueDepth: 2 }}
        />
      </MemoryRouter>
    );
    expect(container.querySelector('.engine-activity-indicator__queue')).toBeInTheDocument();
  });
});
