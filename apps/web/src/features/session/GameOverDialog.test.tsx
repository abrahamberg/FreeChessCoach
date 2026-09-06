import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { GameOverDialog } from './GameOverDialog.js';

describe('GameOverDialog', () => {
  test('renders the game-ending result and fires onContinue when clicked', () => {
    const onContinue = vi.fn();
    render(
      <GameOverDialog gameOver={{ result: '0-1', reason: 'checkmate' }} userColor="black" botName="Trappy Tom" onContinue={onContinue} />
    );

    expect(screen.getByText('Checkmate — you win!')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test('pressing Escape also dismisses it (Modal\'s own behavior)', () => {
    const onContinue = vi.fn();
    render(
      <GameOverDialog gameOver={{ result: '1/2-1/2', reason: 'stalemate' }} userColor="white" botName="Trappy Tom" onContinue={onContinue} />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
