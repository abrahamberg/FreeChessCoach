import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resetSharedLiteEngineWorkerForTests } from '../../engine/shared-engine-worker-instance.js';
import { BotStatusPanel } from './BotStatusPanel.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('BotStatusPanel', () => {
  beforeEach(() => resetSharedLiteEngineWorkerForTests());
  afterEach(() => resetSharedLiteEngineWorkerForTests());

  test('no fen prop: no lite-hint readout at all', () => {
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn gameOver={null} userColor="white" />);
    expect(screen.queryByText(/light engine not loaded/)).not.toBeInTheDocument();
  });

  test('with a fen and no game over: shows "light engine not loaded yet" until the lite worker is ready', () => {
    // No createWorker seeded on the lite singleton (Worker doesn't exist in
    // jsdom), so it stays in its initial 'absent' state — exactly the "not
    // loaded yet" case this readout exists for.
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn gameOver={null} userColor="white" fen={START_FEN} />);
    expect(screen.getByText(/light engine not loaded yet/)).toBeInTheDocument();
  });

  test('the lite-hint readout is hidden once the game is over', () => {
    render(
      <BotStatusPanel
        botName="Trappy Tom"
        isPlayerTurn={false}
        gameOver={{ result: '1-0', reason: 'checkmate' }}
        userColor="black"
        fen={START_FEN}
      />
    );
    expect(screen.queryByText(/light engine not loaded/)).not.toBeInTheDocument();
  });

  test('shows "Your move" when it is the player\'s turn', () => {
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn gameOver={null} userColor="white" />);
    expect(screen.getByText('Your move')).toBeInTheDocument();
  });

  test('shows the bot as thinking when it is not the player\'s turn', () => {
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn={false} gameOver={null} userColor="white" />);
    expect(screen.getByText('Trappy Tom is thinking…')).toBeInTheDocument();
  });

  test('a checkmate the player delivered reads as a win', () => {
    render(
      <BotStatusPanel
        botName="Trappy Tom"
        isPlayerTurn={false}
        gameOver={{ result: '0-1', reason: 'checkmate' }}
        userColor="black"
      />
    );
    expect(screen.getByText('Checkmate — you win!')).toBeInTheDocument();
  });

  test('a checkmate the bot delivered names the bot', () => {
    render(
      <BotStatusPanel
        botName="Trappy Tom"
        isPlayerTurn={false}
        gameOver={{ result: '1-0', reason: 'checkmate' }}
        userColor="black"
      />
    );
    expect(screen.getByText('Checkmate — Trappy Tom wins.')).toBeInTheDocument();
  });

  test.each([
    ['stalemate', 'Draw by stalemate.'],
    ['insufficient_material', 'Draw by insufficient material.'],
    ['threefold_repetition', 'Draw by threefold repetition.'],
    ['fifty_move_rule', 'Draw by the fifty-move rule.']
  ] as const)('renders the draw reason for %s', (reason, expected) => {
    render(
      <BotStatusPanel botName="Trappy Tom" isPlayerTurn={false} gameOver={{ result: '1/2-1/2', reason }} userColor="white" />
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  test('shows the bot avatar and rating', () => {
    render(
      <BotStatusPanel botName="Trappy Tom" botAvatarIndex={7} botElo={1200} isPlayerTurn gameOver={null} userColor="white" />
    );
    expect(screen.getByTestId('bot-avatar')).toBeInTheDocument();
    expect(screen.getByText('1200')).toBeInTheDocument();
  });

  test('the resign button fires onResign', () => {
    const onResign = vi.fn();
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn gameOver={null} userColor="white" onResign={onResign} />);
    fireEvent.click(screen.getByText('Resign'));
    expect(onResign).toHaveBeenCalledTimes(1);
  });

  test('the resign button is hidden once the game is over', () => {
    render(
      <BotStatusPanel
        botName="Trappy Tom"
        isPlayerTurn={false}
        gameOver={{ result: '1-0', reason: 'checkmate' }}
        userColor="black"
        onResign={vi.fn()}
      />
    );
    expect(screen.queryByText('Resign')).not.toBeInTheDocument();
  });
});
