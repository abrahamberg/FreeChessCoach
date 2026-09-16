import { describe, expect, test } from 'vitest';
import { describeGameOver } from './botGameOver.js';

describe('describeGameOver', () => {
  test('a checkmate the player delivered reads as a win', () => {
    expect(describeGameOver({ result: '0-1', reason: 'checkmate' }, 'black', 'Trappy Tom')).toBe('Checkmate — you win!');
  });

  test('a checkmate the bot delivered names the bot', () => {
    expect(describeGameOver({ result: '1-0', reason: 'checkmate' }, 'black', 'Trappy Tom')).toBe('Checkmate — Trappy Tom wins.');
  });

  test('a timeout the player wins on reads as a win', () => {
    expect(describeGameOver({ result: '1-0', reason: 'timeout' }, 'white', 'Trappy Tom')).toBe("Time's up — you win!");
  });

  test('a timeout the player loses on names the bot', () => {
    expect(describeGameOver({ result: '0-1', reason: 'timeout' }, 'white', 'Trappy Tom')).toBe("Time's up — Trappy Tom wins.");
  });

  test('a resignation reads as the student resigning', () => {
    expect(describeGameOver({ result: '0-1', reason: 'resignation' }, 'white', 'Trappy Tom')).toBe(
      'You resigned — Trappy Tom wins.'
    );
  });

  test.each([
    ['stalemate', 'Draw by stalemate.'],
    ['insufficient_material', 'Draw by insufficient material.'],
    ['threefold_repetition', 'Draw by threefold repetition.'],
    ['fifty_move_rule', 'Draw by the fifty-move rule.']
  ] as const)('renders the draw reason for %s', (reason, expected) => {
    expect(describeGameOver({ result: '1/2-1/2', reason }, 'white', 'Trappy Tom')).toBe(expected);
  });
});
