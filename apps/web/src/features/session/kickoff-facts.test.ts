import type { GameReport, PlayerReport } from '@freechesscoach/shared';
import { describe, expect, test } from 'vitest';
import { buildKickoffFacts, formatMoveLabel } from './kickoff-facts.js';

type ClassifiedMove = GameReport['moves'][number];

function counts(overrides: Partial<PlayerReport['counts']> = {}): PlayerReport['counts'] {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    book: 0,
    inaccuracy: 0,
    mistake: 0,
    miss: 0,
    blunder: 0,
    forced: 0,
    ...overrides
  };
}

function player(accuracy: number, overrides: Partial<PlayerReport> = {}): PlayerReport {
  return {
    accuracy,
    counts: counts(),
    estimatedRating: { value: null, range: null, confidence: 'low' },
    ...overrides
  } as PlayerReport;
}

function move(ply: number, moveSan: string, overrides: Partial<ClassifiedMove> = {}): ClassifiedMove {
  return {
    ply,
    moveSan,
    mover: ply % 2 === 1 ? 'white' : 'black',
    isUserMove: ply % 2 === 1,
    cpLoss: 0,
    quality: 'good',
    ...overrides
  } as ClassifiedMove;
}

function report(white: PlayerReport, black: PlayerReport, moves: ClassifiedMove[]): GameReport {
  return { players: { white, black }, moves } as GameReport;
}

describe('buildKickoffFacts', () => {
  test('no report yet means no facts, so the plain indicator shows', () => {
    expect(buildKickoffFacts(null, 'white')).toEqual([]);
  });

  test("walks through the user's own side of the game", () => {
    const moves = [
      move(1, 'e4'),
      move(2, 'e5'),
      move(3, 'Nf3', { quality: 'mistake', cpLoss: 120 }),
      move(4, 'Nc6'),
      move(5, 'Qh5', { quality: 'blunder', cpLoss: 450 })
    ];
    const white = player(71.6, {
      counts: counts({ blunder: 1, mistake: 1, great: 1 }),
      estimatedRating: { value: 1452, range: [1300, 1600], confidence: 'medium' }
    });
    expect(buildKickoffFacts(report(white, player(88.2), moves), 'white')).toEqual([
      'Went through all 3 moves',
      'Your accuracy: 72% (opponent 88%)',
      'Spotted 1 blunder and 1 mistake',
      'Biggest turning point: 3. Qh5',
      'Found 1 great move of yours',
      'Played at about 1452 strength'
    ]);
  });

  test('a clean game says so and skips the turning point', () => {
    const facts = buildKickoffFacts(report(player(90), player(80), [move(1, 'e4'), move(2, 'e5')]), 'black');
    expect(facts).toEqual(['Went through all 1 move', 'Your accuracy: 80% (opponent 90%)', 'No blunders or mistakes from you']);
  });
});

describe('formatMoveLabel', () => {
  test('uses move-pair numbering with dots for Black', () => {
    expect(formatMoveLabel({ ply: 5, moveSan: 'Qh5' })).toBe('3. Qh5');
    expect(formatMoveLabel({ ply: 6, moveSan: 'g6' })).toBe('3... g6');
  });
});
