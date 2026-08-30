import type { MoveReport } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { openingMistakeCount } from './opening-mistakes.js';

function move(overrides: Partial<MoveReport> & Pick<MoveReport, 'ply' | 'moveSan' | 'mover' | 'quality' | 'phase'>): MoveReport {
  return {
    isUserMove: true,
    cpLoss: 0,
    bestLineSan: [],
    evalAfterCp: 0,
    hangsPiece: false,
    ...overrides
  };
}

describe('openingMistakeCount', () => {
  test('counts inaccuracy/mistake/miss/blunder moves in the opening for the given colour', () => {
    const moves: MoveReport[] = [
      move({ ply: 1, moveSan: 'e4', mover: 'white', phase: 'opening', quality: 'best' }),
      move({ ply: 2, moveSan: 'e5', mover: 'black', phase: 'opening', quality: 'inaccuracy' }),
      move({ ply: 3, moveSan: 'Nf3', mover: 'white', phase: 'opening', quality: 'mistake' }),
      move({ ply: 4, moveSan: 'Nc6', mover: 'black', phase: 'opening', quality: 'blunder' }),
      move({ ply: 5, moveSan: 'Bb5', mover: 'white', phase: 'opening', quality: 'miss' })
    ];

    expect(openingMistakeCount(moves, 'white')).toBe(2);
    expect(openingMistakeCount(moves, 'black')).toBe(2);
  });

  test('ignores mistakes outside the opening phase', () => {
    const moves: MoveReport[] = [move({ ply: 20, moveSan: 'Qd2', mover: 'white', phase: 'middlegame', quality: 'blunder' })];

    expect(openingMistakeCount(moves, 'white')).toBe(0);
  });

  test('ignores non-mistake qualities', () => {
    const moves: MoveReport[] = [
      move({ ply: 1, moveSan: 'e4', mover: 'white', phase: 'opening', quality: 'best' }),
      move({ ply: 3, moveSan: 'Nf3', mover: 'white', phase: 'opening', quality: 'excellent' }),
      move({ ply: 5, moveSan: 'Bb5', mover: 'white', phase: 'opening', quality: 'book' })
    ];

    expect(openingMistakeCount(moves, 'white')).toBe(0);
  });
});
