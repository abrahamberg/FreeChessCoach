import { render, screen, within } from '@testing-library/react';
import type { BotThinkingMove } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { BotThinkingLog } from './BotThinkingLog.js';

function doneMove(ply: number, picked: string, startedAt = 10_000): BotThinkingMove {
  return {
    ply,
    source: 'turn',
    status: 'done',
    startedAt,
    endedAt: startedAt + 1400,
    path: 'top moves — best move',
    picked,
    engineMode: 'internal',
    steps: [
      { id: 1, label: 'Grading your move and saving it', detail: 'saved', startedAt, endedAt: startedAt + 310, status: 'done' },
      { id: 2, label: 'Engine search (attempt 1 of 3)', detail: '2 lines returned', startedAt: startedAt + 310, endedAt: startedAt + 1200, status: 'done' }
    ]
  };
}

const THINKING_MOVE: BotThinkingMove = {
  ply: 4,
  source: 'turn',
  status: 'thinking',
  startedAt: 20_000,
  endedAt: null,
  path: null,
  picked: null,
  engineMode: null,
  steps: [
    { id: 1, label: 'Grading your move and saving it', startedAt: 20_000, endedAt: 20_200, status: 'done' },
    { id: 2, label: 'Engine search (attempt 1 of 3)', detail: 'asking for depth 18, up to 40 lines', startedAt: 20_200, endedAt: null, status: 'running' }
  ]
};

describe('BotThinkingLog', () => {
  test('says so when the bot has not moved yet', () => {
    render(<BotThinkingLog moves={[]} now={0} />);
    expect(screen.getByText(/no bot moves yet/i)).toBeInTheDocument();
  });

  test('shows each move with what was played, the path taken and the total time', () => {
    render(<BotThinkingLog moves={[doneMove(2, 'e5')]} now={99_999} />);

    expect(screen.getByText(/Move 1 · Black \(ply 2\)/)).toBeInTheDocument();
    expect(screen.getByText(/played e5/)).toBeInTheDocument();
    expect(screen.getByText(/top moves — best move/)).toBeInTheDocument();
    expect(screen.getByText(/done in 1\.40s/)).toBeInTheDocument();
  });

  test('lists every step with its own start offset, duration and detail', () => {
    render(<BotThinkingLog moves={[doneMove(2, 'e5')]} now={99_999} />);

    const engineStep = screen.getByText('Engine search (attempt 1 of 3)').closest('li');
    expect(engineStep).not.toBeNull();
    expect(within(engineStep as HTMLElement).getByText('+310ms')).toBeInTheDocument();
    expect(within(engineStep as HTMLElement).getByText('890ms')).toBeInTheDocument();
    expect(within(engineStep as HTMLElement).getByText('2 lines returned')).toBeInTheDocument();
  });

  test('a running step counts up to the current time and is marked running', () => {
    render(<BotThinkingLog moves={[THINKING_MOVE]} now={26_450} />);

    const running = screen.getByText('Engine search (attempt 1 of 3)').closest('li') as HTMLElement;
    expect(running).toHaveAttribute('data-status', 'running');
    expect(within(running).getByText('6.25s')).toBeInTheDocument();
    expect(screen.getByText(/thinking for 6\.45s/i)).toBeInTheDocument();
  });

  test('puts the newest move first, open, and folds older ones away', () => {
    const { container } = render(<BotThinkingLog moves={[doneMove(2, 'e5'), doneMove(4, 'Nf6', 30_000)]} now={99_999} />);

    const entries = Array.from(container.querySelectorAll('details'));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('ply 4');
    expect(entries[0]).toHaveAttribute('open');
    expect(entries[1]).toHaveTextContent('ply 2');
    expect(entries[1]).not.toHaveAttribute('open');
  });

  test('shows a failed step and failed move so a stuck retry is obvious', () => {
    const failed: BotThinkingMove = {
      ...THINKING_MOVE,
      status: 'failed',
      endedAt: 23_000,
      steps: [{ id: 1, label: 'Engine search (attempt 1 of 3)', detail: 'engine down', startedAt: 20_000, endedAt: 23_000, status: 'failed' }]
    };

    render(<BotThinkingLog moves={[failed]} now={99_999} />);

    expect(screen.getByText(/failed after 3\.00s/i)).toBeInTheDocument();
    expect(screen.getByText('Engine search (attempt 1 of 3)').closest('li')).toHaveAttribute('data-status', 'failed');
    expect(screen.getByText('engine down')).toBeInTheDocument();
  });
});
