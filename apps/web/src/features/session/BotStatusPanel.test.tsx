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

  test('shows the bot as thinking mid-request, even while isPlayerTurn is still true (the position hasn\'t advanced yet)', () => {
    render(<BotStatusPanel botName="Trappy Tom" isPlayerTurn isBotThinking gameOver={null} userColor="white" />);
    expect(screen.getByText('Trappy Tom is thinking…')).toBeInTheDocument();
    expect(screen.queryByText('Your move')).not.toBeInTheDocument();
  });

  // describeGameOver's own branches (checkmate/timeout/resignation/each draw
  // reason) are exhaustively covered by botGameOver.test.ts; this just needs
  // one case to prove the panel actually renders what that function returns.
  test('renders the describeGameOver string when the game is over', () => {
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
